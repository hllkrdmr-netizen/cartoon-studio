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

export type MouthLocation = {
  found: boolean;
  /** Top-left x of the mouth bbox, normalized 0-1. */
  x: number;
  /** Top-left y of the mouth bbox, normalized 0-1. */
  y: number;
  /** Width of the mouth bbox, normalized 0-1. */
  width: number;
  /** Height of the mouth bbox, normalized 0-1. */
  height: number;
};

// Models — chosen for the trade-off between quality and cost. Override via
// env if you want to experiment.
const DIALOGUE_MODEL = process.env.AGENT_PARK_DIALOGUE_MODEL ?? 'gpt-4o';
const REWRITE_MODEL = process.env.AGENT_PARK_REWRITE_MODEL ?? 'gpt-4o-mini';
const VISION_MODEL = process.env.AGENT_PARK_VISION_MODEL ?? 'gpt-4o';

function client(): OpenAI {
  const apiKey = settings.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Add it in Settings to use LLM features.',
    );
  }
  return new OpenAI({ apiKey });
}

const DIALOGUE_SYSTEM = `You are a comedy writer for short animated dialogues in the style of South Park: punchy, conversational, irreverent. Each line is delivered by exactly one character. Keep lines under 25 words; aim for a natural back-and-forth rhythm. Avoid stage directions, parentheticals, or speaker prefixes — just the spoken text. Match each line to a speakerId from the provided cast.`;

const REWRITE_SYSTEM = `You are an editor for short animated dialogues. You rewrite a single spoken line per the user's instruction without adding stage directions, parentheticals, or quotation marks. Return only the rewritten line as plain text — no explanation, no preamble.`;

const MOUTH_VISION_SYSTEM = `You analyze cartoon character images and identify mouth locations. The character may face the camera directly or at an angle. The mouth might be a line, an oval, an open shape with teeth/tongue, or a small dark gap. Always pick the most plausible single mouth region — never multiple regions, never the eyes or nose.`;

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

const MouthSchema = z.object({
  found: z.boolean(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export async function detectMouthInImage(
  pngBuffer: Buffer,
): Promise<MouthLocation> {
  const c = client();
  const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`;

  const completion = await c.chat.completions.parse({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: MOUTH_VISION_SYSTEM },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Find the mouth on this character. Return the bounding box as fractions of the image: 0,0 is top-left and 1,1 is bottom-right. If no mouth is visible (e.g. the figure has no face), set found=false and pass zeros.',
          },
          { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
        ],
      },
    ],
    response_format: zodResponseFormat(MouthSchema, 'mouth_location'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message.refusal;
    throw new Error(
      refusal
        ? `Vision request refused: ${refusal}`
        : 'Vision request returned no parsed output.',
    );
  }

  return {
    found: Boolean(parsed.found),
    x: clamp01(parsed.x),
    y: clamp01(parsed.y),
    width: clamp01(parsed.width),
    height: clamp01(parsed.height),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
