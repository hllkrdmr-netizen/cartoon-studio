// Vowel-per-word heuristic mouth cue generator.
// Ported from talking-avatar/hyperframes/dialogue-test/build-scene.mjs.

import type { Word } from './tts';

export type Cue = { start: number; end: number; value: string };

function vowelShape(text: string): string {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  if (!t) return 'X';
  if (/oo|ou|ew|u|w/.test(t)) return 'F';
  if (/o/.test(t)) return 'E';
  if (/ee|ea|y/.test(t)) return 'C';
  if (/a/.test(t)) return 'D';
  if (/[ei]/.test(t)) return 'C';
  return 'C';
}

function startCap(text: string): string | null {
  const c = text.toLowerCase().replace(/[^a-z]/, '').charAt(0);
  if (/[bpm]/.test(c)) return 'B';
  if (/[fv]/.test(c)) return 'G';
  return null;
}

function endCap(text: string): string | null {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  const last = t.charAt(t.length - 1);
  if (/[st]/.test(last)) return 'B';
  return null;
}

export function buildMouthCues(
  words: Word[],
  totalDuration: number,
): Cue[] {
  const cues: Cue[] = [];
  let t = 0;
  const CAP = 0.06;
  for (const w of words) {
    if (w.start >= totalDuration) break;
    const start = w.start;
    const end = Math.min(w.end, totalDuration);
    if (start > t + 0.05) cues.push({ start: t, end: start, value: 'X' });
    const main = vowelShape(w.text);
    const head = startCap(w.text);
    const tail = endCap(w.text);
    const dur = end - start;
    if (dur < 0.12) {
      cues.push({ start, end, value: main });
    } else {
      let cursor = start;
      if (head && dur > 0.18) {
        const headEnd = Math.min(start + CAP, end);
        cues.push({ start: cursor, end: headEnd, value: head });
        cursor = headEnd;
      }
      const mainEnd =
        tail && dur > 0.18 ? Math.max(cursor + 0.04, end - CAP) : end;
      cues.push({ start: cursor, end: mainEnd, value: main });
      if (tail && mainEnd < end) {
        cues.push({ start: mainEnd, end, value: tail });
      }
    }
    t = end;
  }
  if (t < totalDuration) cues.push({ start: t, end: totalDuration, value: 'X' });
  return cues;
}
