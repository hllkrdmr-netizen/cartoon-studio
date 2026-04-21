import Anthropic from '@anthropic-ai/sdk';
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

function client(): Anthropic {
  const apiKey = settings.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it in Settings to use LLM dialogue features.',
    );
  }
  return new Anthropic({ apiKey });
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

export async function generateDialogue(args: {
  premise: string;
  cast: Cast;
  lineCount: number;
}): Promise<GeneratedLine[]> {
  if (args.cast.length === 0) {
    throw new Error('Add at least one character to the show before generating dialogue.');
  }

  const c = client();
  const userPrompt = `Premise: ${args.premise}

Cast (use these speakerId values verbatim):
${args.cast.map((c) => `- ${c.id} → ${c.name}`).join('\n')}

Write ${args.lineCount} lines of dialogue. Distribute lines across all listed speakers. Return via the emit_dialogue tool.`;

  const r = await c.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: DIALOGUE_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [
      {
        name: 'emit_dialogue',
        description: 'Emit the generated dialogue lines.',
        input_schema: {
          type: 'object',
          properties: {
            lines: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  speakerId: { type: 'string' },
                  text: { type: 'string' },
                },
                required: ['speakerId', 'text'],
              },
            },
          },
          required: ['lines'],
        },
      },
    ],
    tool_choice: { type: 'tool', name: 'emit_dialogue' },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolUse = r.content.find(
    (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
  );
  if (!toolUse) throw new Error('LLM did not return a dialogue tool call.');
  const lines = (toolUse.input as { lines: Array<{ speakerId: string; text: string }> })
    .lines;

  // Map speakerId → consistent voice. If model returned an unknown id, fall back
  // to the first cast member.
  const speakerVoice = new Map<string, ReturnType<typeof assignVoice>>();
  args.cast.forEach((c, i) => speakerVoice.set(c.id, assignVoice(i)));
  const fallback = args.cast[0].id;

  return lines.map((l) => {
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

  const r = await c.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 256,
    thinking: { type: 'adaptive' },
    system: [
      { type: 'text', text: REWRITE_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });

  const text = r.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('LLM returned no text.');
  return text.replace(/^["'`]+|["'`]+$/g, '');
}
