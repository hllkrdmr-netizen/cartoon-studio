#!/usr/bin/env -S npx tsx
//
// Rig a character SVG for lip-sync, outside the Electron app.
//
// Same pipeline the app uses (rigPipeline.ts):
//   1. Geometric heuristic (rigSvg) — fast, free, works on most humans.
//   2. Vision LLM detection — bbox + face bbox + confidence.
//   3. Geometric removal of paths whose bbox is mostly inside the mouth
//      bbox; rig template scaled to the actual mouth width.
//   4. Verify-and-retry (when confidence is low or removal touched
//      nothing) — re-rasterize, ask the LLM if the mouth area is clean,
//      expand bbox + retry once if remnants are still visible.
//
// Usage:
//   npm run rig -- <input.svg> <output.svg>
//
// `npm run rig` wraps `tsx --env-file=.env`, so OPENAI_API_KEY is loaded
// from the repo-root .env file automatically. To override one-off:
//   OPENAI_API_KEY=sk-... npx tsx scripts/rig-svg.ts <input> <output>
//
// Notes:
//   - rsvg-convert must be installed (brew install librsvg).
//   - OPENAI_API_KEY only required if the heuristic misses.
//   - Background-strips and viewBox-normalizes the input first, so it's
//     safe to run on raw Recraft output.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import OpenAI from 'openai';
import {
  rigSvg,
  stripMagenta,
  stripBackgroundFill,
  normalizeViewBox,
} from '../src/main/svgRig';
import { rigCharacterWithVision } from '../src/main/rigPipeline';

function rasterize(svg: string, size = 1024): Buffer {
  // Pipe SVG through rsvg-convert via stdin so we don't litter /tmp.
  // -a keeps aspect ratio, -b white matches the BrowserWindow renderer's
  // white-background HTML wrapper used by the app's upload flow.
  return execFileSync(
    'rsvg-convert',
    ['-w', String(size), '-h', String(size), '-a', '-b', 'white'],
    { input: svg, maxBuffer: 16 * 1024 * 1024 },
  );
}

async function rig(inputPath: string, outputPath: string): Promise<void> {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const cleaned = stripBackgroundFill(stripMagenta(raw));
  const normalized = normalizeViewBox(cleaned);

  const heur = rigSvg(normalized);
  if (heur.rigged) {
    fs.writeFileSync(outputPath, heur.svg);
    console.log(`✓ heuristic rig succeeded → ${outputPath}`);
    return;
  }

  console.log('… heuristic miss, falling back to vision pipeline');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Heuristic missed and OPENAI_API_KEY is not set. Pass it via env to use the vision fallback.',
    );
  }
  const openai = new OpenAI({ apiKey });
  const initialRaster = rasterize(normalized);

  // When --debug is passed, dump intermediate artifacts next to the
  // output so a human can inspect what the LLM saw + decided.
  const debug = process.argv.includes('--debug');
  const debugDir = debug ? path.join(path.dirname(outputPath), '.rig-debug') : null;
  if (debugDir) {
    fs.mkdirSync(debugDir, { recursive: true });
    fs.writeFileSync(path.join(debugDir, 'pass1-input.png'), initialRaster);
  }

  const result = await rigCharacterWithVision(normalized, {
    initialRaster,
    rerasterize: async (s) => {
      const png = rasterize(s);
      if (debugDir) {
        const idx = (rerasterCount++).toString().padStart(2, '0');
        fs.writeFileSync(path.join(debugDir, `reraster-${idx}.png`), png);
      }
      return png;
    },
    openai,
  });

  if (result.status === 'failed') {
    throw new Error(result.reason ?? 'vision pipeline failed');
  }
  fs.writeFileSync(outputPath, result.svg);
  if (debugDir) {
    fs.writeFileSync(
      path.join(debugDir, 'landmarks.json'),
      JSON.stringify(result.landmarks, null, 2),
    );
    fs.writeFileSync(
      path.join(debugDir, 'detection.json'),
      JSON.stringify(result.detection, null, 2),
    );
    fs.writeFileSync(path.join(debugDir, 'rigged.svg'), result.svg);
    fs.writeFileSync(
      path.join(debugDir, 'rigged-final.png'),
      rasterize(result.svg),
    );
  }
  const lm = result.landmarks;
  const det = result.detection;
  if (lm) {
    console.log(
      `✓ landmarks — left_eye=(${lm.leftEye.x.toFixed(2)},${lm.leftEye.y.toFixed(2)}) ` +
        `right_eye=(${lm.rightEye.x.toFixed(2)},${lm.rightEye.y.toFixed(2)}) ` +
        `mouth=(${lm.mouthCenter.x.toFixed(2)},${lm.mouthCenter.y.toFixed(2)}) ` +
        `mouth_w=${lm.mouthWidth.toFixed(3)} confidence=${lm.confidence.toFixed(2)}`,
    );
  }
  if (det) {
    console.log(
      `  derived face=(${det.face.x.toFixed(2)},${det.face.y.toFixed(2)},${det.face.width.toFixed(2)},${det.face.height.toFixed(2)}) ` +
        `mouth=(${det.mouth.x.toFixed(2)},${det.mouth.y.toFixed(2)},${det.mouth.width.toFixed(2)},${det.mouth.height.toFixed(2)})`,
    );
  }
  console.log(
    `  refined=${result.refined ?? false} removed=${result.removedPaths} scale=${result.scale?.toFixed(2)} ` +
      `attempts=${result.attempts} verified=${result.verified ?? false}`,
  );
  if (result.verificationNotes) {
    console.log(`  notes: ${result.verificationNotes}`);
  }
  if (result.reason) {
    console.warn(`! ${result.reason}`);
  }
  if (debugDir) {
    console.log(`  debug artifacts in ${debugDir}/`);
  }
  console.log(`→ ${outputPath}`);
}

let rerasterCount = 0;

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    'Usage: npx tsx scripts/rig-svg.ts <input.svg> <output.svg>\n' +
      '       OPENAI_API_KEY=... required only if the heuristic misses.',
  );
  process.exit(2);
}
const inAbs = path.resolve(input);
const outAbs = path.resolve(output);
rig(inAbs, outAbs).catch((err: Error) => {
  console.error(`✗ ${err.message}`);
  process.exit(1);
});
