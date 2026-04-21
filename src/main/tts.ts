import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { generateSpeech } from '@speech-sdk/core';
import OpenAI from 'openai';
import { applyKeysToEnv } from './env';
import { settings } from './settings';
import { showWorkingDir } from './showStore';

export type Word = { text: string; start: number; end: number };

export type TtsResult = {
  audioFile: string; // relative to show dir
  words: Word[];
  durationMs: number;
  cached: boolean;
  hash: string;
};

type TtsRequest = {
  showId: string;
  lineId: string;
  text: string;
  model: string;
  voice: string;
  provider: string;
};

const META_SUFFIX = '.meta.json';
const TRANSCRIPT_SUFFIX = '.transcript.json';

function hashRequest(r: TtsRequest): string {
  return crypto
    .createHash('sha256')
    .update(`${r.model}|${r.voice}|${r.text}`)
    .digest('hex')
    .slice(0, 16);
}

function extForMediaType(mt: string): string {
  if (mt.includes('wav')) return 'wav';
  if (mt.includes('mpeg') || mt.includes('mp3')) return 'mp3';
  if (mt.includes('ogg')) return 'ogg';
  return 'bin';
}

export async function generateLine(req: TtsRequest): Promise<TtsResult> {
  applyKeysToEnv();

  const dir = showWorkingDir(req.showId);
  await fs.mkdir(dir, { recursive: true });

  const hash = hashRequest(req);
  const metaPath = path.join(dir, `${req.lineId}${META_SUFFIX}`);
  try {
    const cached = JSON.parse(await fs.readFile(metaPath, 'utf8'));
    if (cached.hash === hash) {
      return { ...cached, cached: true };
    }
  } catch {
    // no cache
  }

  // 0.6.2's GenerateSpeechOptions doesn't declare `timestamps`, but 0.7.0
  // does. Pass it through as any so a future upgrade auto-enables native
  // alignment for providers that support it (ElevenLabs).
  const result = await generateSpeech({
    model: req.model,
    voice: req.voice,
    text: req.text,
    timestamps: 'on',
  } as Parameters<typeof generateSpeech>[0]);

  const ext = extForMediaType(result.audio.mediaType);
  const audioFile = `${req.lineId}.${ext}`;
  await fs.writeFile(path.join(dir, audioFile), result.audio.uint8Array);

  let words: Word[] = [];
  // Native timestamps if the SDK returned them.
  const native = (result as unknown as { timestamps?: Word[] }).timestamps;
  if (Array.isArray(native) && native.length > 0) {
    words = native.map((w) => ({ text: w.text, start: w.start, end: w.end }));
  } else {
    words = await whisperWords(path.join(dir, audioFile));
  }

  await fs.writeFile(
    path.join(dir, `${req.lineId}${TRANSCRIPT_SUFFIX}`),
    JSON.stringify(words, null, 2),
  );

  const durationMs =
    result.metadata.audioDurationMs ??
    Math.round((words.at(-1)?.end ?? 0) * 1000) + 200;
  const meta = { hash, audioFile, words, durationMs };
  await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));

  return { ...meta, cached: false };
}

export async function readLineMeta(
  showId: string,
  lineId: string,
): Promise<TtsResult | null> {
  try {
    const raw = await fs.readFile(
      path.join(showWorkingDir(showId), `${lineId}${META_SUFFIX}`),
      'utf8',
    );
    const m = JSON.parse(raw) as Omit<TtsResult, 'cached'>;
    return { ...m, cached: true };
  } catch {
    return null;
  }
}

async function whisperWords(audioPath: string): Promise<Word[]> {
  const apiKey = settings.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'No OPENAI_API_KEY set. ElevenLabs has native timestamps but ' +
        'every other provider (and the 0.6.2 SDK on every provider) needs ' +
        'OpenAI Whisper for word-level alignment. Set the key in Settings.',
    );
  }
  const openai = new OpenAI({ apiKey });
  const r = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });
  const arr = (r as unknown as { words?: Array<{ word: string; start: number; end: number }> })
    .words ?? [];
  return arr.map((w) => ({ text: w.word, start: w.start, end: w.end }));
}
