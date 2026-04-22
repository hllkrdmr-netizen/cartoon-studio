import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { settings } from './settings';

type Cast = Array<{ id: string; name: string }>;

export type GeneratedLine = {
  speakerId: string;
  text: string;
};

// Models — chosen for the trade-off between quality and cost. Override via
// env if you want to experiment. Vision model lives in llm-core.ts so the
// CLI rigging script picks up the same default. We default reasoning to
// "none" for these creative-text paths — dialogue writing and one-line
// rewrites don't benefit from chain-of-thought and we'd rather have the
// latency budget.
const DIALOGUE_MODEL = process.env.CARTOON_STUDIO_DIALOGUE_MODEL ?? 'gpt-5.4';
const REWRITE_MODEL = process.env.CARTOON_STUDIO_REWRITE_MODEL ?? 'gpt-5.4';

function client(): OpenAI {
  const apiKey = settings.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it in Settings to use LLM features.',
    );
  }
  return new OpenAI({ apiKey });
}

export function buildOpenAIClient(): OpenAI {
  return client();
}

const DIALOGUE_SYSTEM = `You are a comedy writer for short animated dialogues in the style of South Park: punchy, conversational, irreverent. Each line is delivered by exactly one character. Keep lines under 25 words; aim for a natural back-and-forth rhythm. Avoid stage directions, parentheticals, or speaker prefixes — just the spoken text. Match each line to a speakerId from the provided cast.

When the user doesn't specify a line count, scale the length to the premise: 4-6 lines for a quick gag, 8-12 for a fuller bit, up to 16 if the premise genuinely calls for it. Never pad — end when the exchange lands. Don't exceed 20 lines.`;

const REWRITE_SYSTEM = `You are an editor for short animated dialogues. You rewrite a single spoken line per the user's instruction without adding stage directions, parentheticals, or quotation marks. Return only the rewritten line as plain text — no explanation, no preamble.`;

const DialogueSchema = z.object({
  lines: z
    .array(
      z.object({
        speakerId: z.string(),
        text: z.string(),
      }),
    )
    .min(1)
    .max(20),
});

export async function generateDialogue(args: {
  premise: string;
  cast: Cast;
  lineCount?: number;
}): Promise<GeneratedLine[]> {
  if (args.cast.length === 0) {
    throw new Error(
      'Add at least one character to the show before generating dialogue.',
    );
  }

  const c = client();
  const lengthDirective =
    args.lineCount && args.lineCount > 0
      ? `Write exactly ${args.lineCount} lines of dialogue.`
      : `Write a dialogue whose length fits the premise — follow the guidance in the system prompt.`;
  const userPrompt = `Premise: ${args.premise}

Cast (use these speakerId values verbatim):
${args.cast.map((c) => `- ${c.id} → ${c.name}`).join('\n')}

${lengthDirective} Distribute lines across all listed speakers.`;

  const completion = await c.chat.completions.parse({
    model: DIALOGUE_MODEL,
    messages: [
      { role: 'system', content: DIALOGUE_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
    response_format: zodResponseFormat(DialogueSchema, 'dialogue'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message.refusal;
    throw new Error(
      refusal
        ? `Dialogue generation refused: ${refusal}`
        : 'Dialogue generation returned no parsed output.',
    );
  }

  // Voice assignment is a renderer concern — each character carries its
  // own voice mapping. The LLM only produces speakerId/text; callers fill
  // in provider/model/voice from the character record. Unknown speakerIds
  // fall back to the first cast member so we never emit a dangling line.
  const knownIds = new Set(args.cast.map((c) => c.id));
  const fallback = args.cast[0].id;

  return parsed.lines.map((l) => ({
    speakerId: knownIds.has(l.speakerId) ? l.speakerId : fallback,
    text: l.text.trim(),
  }));
}

export async function rewriteLine(args: {
  text: string;
  instruction: string;
  surrounding?: string;
}): Promise<string> {
  const c = client();
  const userPrompt = `${args.surrounding ? `Context (other lines in this exchange):\n${args.surrounding}\n\n` : ''}Original line: ${args.text}

Instruction: ${args.instruction}

Rewrite the line.`;

  const completion = await c.chat.completions.create({
    model: REWRITE_MODEL,
    max_tokens: 256,
    messages: [
      { role: 'system', content: REWRITE_SYSTEM },
      { role: 'user', content: userPrompt },
    ],
  });

  const text = completion.choices[0]?.message.content?.trim();
  if (!text) throw new Error('LLM returned no text.');
  return text.replace(/^["'`]+|["'`]+$/g, '');
}

