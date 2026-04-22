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
  force?: boolean;
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
  if (!req.force) {
    try {
      const cached = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      if (cached.hash === hash) {
        return { ...cached, cached: true };
      }
    } catch {
      // no cache
    }
  }

  let audio: Uint8Array;
  let mediaType: string;
  let words: Word[] = [];
  let durationMs = 0;

  if (req.provider === 'elevenlabs') {
    // ElevenLabs has native word-level timestamps on its TTS endpoint, but
    // @speech-sdk/core@0.6.2 doesn't expose them yet (the feature is on
    // main but unreleased on npm). Call ElevenLabs directly so we never
    // need an OpenAI key just for ElevenLabs alignment.
    const r = await elevenLabsWithTimestamps({
      model: req.model,
      voice: req.voice,
      text: req.text,
    });
    audio = r.audio;
    mediaType = r.mediaType;
    words = r.words;
    durationMs = r.durationMs;
  } else {
    const result = await generateSpeech({
      model: req.model,
      voice: req.voice,
      text: req.text,
    });
    audio = result.audio.uint8Array;
    mediaType = result.audio.mediaType;
    durationMs = result.metadata.audioDurationMs ?? 0;
  }

  const ext = extForMediaType(mediaType);
  const audioFile = `${req.lineId}.${ext}`;
  const audioPath = path.join(dir, audioFile);
  await fs.writeFile(audioPath, audio);

  if (words.length === 0) {
    words = await whisperWords(audioPath);
  }
  if (!durationMs) {
    durationMs = Math.round((words.at(-1)?.end ?? 0) * 1000) + 200;
  }

  await fs.writeFile(
    path.join(dir, `${req.lineId}${TRANSCRIPT_SUFFIX}`),
    JSON.stringify(words, null, 2),
  );

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

// --- ElevenLabs direct call (native timestamps) ---

type ElevenAlignment = {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
};

async function elevenLabsWithTimestamps(req: {
  model: string;
  voice: string;
  text: string;
}): Promise<{
  audio: Uint8Array;
  mediaType: string;
  words: Word[];
  durationMs: number;
}> {
  const apiKey = settings.get('ELEVEN_API_KEY');
  if (!apiKey) {
    throw new Error(
      'Set ELEVEN_API_KEY in Settings to use ElevenLabs voices.',
    );
  }
  const modelId = req.model.replace(/^elevenlabs\//, '');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voice)}/with-timestamps`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ text: req.text, model_id: modelId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(
      `ElevenLabs TTS failed (${res.status}): ${body.slice(0, 300) || res.statusText}`,
    );
  }
  const data = (await res.json()) as {
    audio_base64: string;
    alignment?: ElevenAlignment;
    normalized_alignment?: ElevenAlignment;
  };
  const audioBuf = Buffer.from(data.audio_base64, 'base64');
  const alignment = data.normalized_alignment ?? data.alignment;
  const words = alignment ? charsToWords(alignment) : [];
  const lastEnd =
    alignment?.character_end_times_seconds.at(-1) ??
    (words.at(-1)?.end ?? 0);

  return {
    audio: new Uint8Array(audioBuf),
    mediaType: 'audio/mpeg',
    words,
    durationMs: Math.round(lastEnd * 1000) + 200,
  };
}

function charsToWords(a: ElevenAlignment): Word[] {
  const out: Word[] = [];
  let current: Word | null = null;
  for (let i = 0; i < a.characters.length; i++) {
    const ch = a.characters[i];
    const start = a.character_start_times_seconds[i];
    const end = a.character_end_times_seconds[i];
    if (/\s/.test(ch)) {
      if (current) {
        out.push(current);
        current = null;
      }
      continue;
    }
    if (!current) {
      current = { text: ch, start, end };
    } else {
      current.text += ch;
      current.end = end;
    }
  }
  if (current) out.push(current);
  return out;
}

// --- Whisper alignment fallback (non-ElevenLabs providers) ---

async function whisperWords(audioPath: string): Promise<Word[]> {
  const apiKey = settings.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error(
      'No OPENAI_API_KEY set. OpenAI and Google TTS providers have no native ' +
        'word-level timestamps, so we need OpenAI Whisper to align the audio. ' +
        'Set the key in Settings, or switch this line to an ElevenLabs voice ' +
        '(which does have native timestamps).',
    );
  }
  const openai = new OpenAI({ apiKey });
  const r = await openai.audio.transcriptions.create({
    file: createReadStream(audioPath),
    model: 'whisper-1',
    response_format: 'verbose_json',
    timestamp_granularities: ['word'],
  });
  const arr =
    (r as unknown as { words?: Array<{ word: string; start: number; end: number }> })
      .words ?? [];
  return arr.map((w) => ({ text: w.word, start: w.start, end: w.end }));
}
