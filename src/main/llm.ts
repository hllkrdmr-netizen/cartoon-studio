import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { settings } from './settings';
import { VOICES, defaultVoice } from '../shared/voices';

type Cast = Array<{ id: string; name: string }>;

export type GeneratedLine = {
  speakerId: string;
  text: string;
  provider: string;
  model: string;
  voice: string;
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

const DIALOGUE_SYSTEM = `You are a comedy writer for short animated dialogues in the style of South Park: punchy, conversational, irreverent. Each line is delivered by exactly one character. Keep lines under 25 words; aim for a natural back-and-forth rhythm. Avoid stage directions, parentheticals, or speaker prefixes — just the spoken text. Match each line to a speakerId from the provided cast.`;

const REWRITE_SYSTEM = `You are an editor for short animated dialogues. You rewrite a single spoken line per the user's instruction without adding stage directions, parentheticals, or quotation marks. Return only the rewritten line as plain text — no explanation, no preamble.`;

function assignVoice(idx: number): {
  provider: string;
  model: string;
  voice: string;
} {
  // Round-robin across the catalog so multi-speaker shows get distinct voices.
  const v = VOICES[idx % VOICES.length] ?? defaultVoice();
  return { provider: v.provider, model: v.model, voice: v.voice };
}

const DialogueSchema = z.object({
  lines: z
    .array(
      z.object({
        speakerId: z.string(),
        text: z.string(),
      }),
    )
    .min(1),
});

export async function generateDialogue(args: {
  premise: string;
  cast: Cast;
  lineCount: number;
}): Promise<GeneratedLine[]> {
  if (args.cast.length === 0) {
    throw new Error(
      'Add at least one character to the show before generating dialogue.',
    );
  }

  const c = client();
  const userPrompt = `Premise: ${args.premise}

Cast (use these speakerId values verbatim):
${args.cast.map((c) => `- ${c.id} → ${c.name}`).join('\n')}

Write ${args.lineCount} lines of dialogue. Distribute lines across all listed speakers.`;

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

  // Map speakerId → consistent voice. Fall back to the first cast member if
  // the model returns an unknown id.
  const speakerVoice = new Map<string, ReturnType<typeof assignVoice>>();
  args.cast.forEach((c, i) => speakerVoice.set(c.id, assignVoice(i)));
  const fallback = args.cast[0].id;

  return parsed.lines.map((l) => {
    const speakerId = speakerVoice.has(l.speakerId) ? l.speakerId : fallback;
    const voice = speakerVoice.get(speakerId)!;
    return {
      speakerId,
      text: l.text.trim(),
      ...voice,
    };
  });
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

