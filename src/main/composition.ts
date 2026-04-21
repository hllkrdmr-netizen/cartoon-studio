import fs from 'node:fs/promises';
import path from 'node:path';
import type { Show } from '../shared/show';
import { showWorkingDir } from './showStore';
import { readLineMeta } from './tts';
import { buildMouthCues, type Cue } from './cues';

const STAGE_W = 1920;
const STAGE_H = 1080;
const GAP_S = 0.35;

type Segment = {
  id: string;
  speaker: string;
  audioUrl: string;
  startAt: number;
  duration: number;
  text: string;
  words: Array<{ text: string; start: number; end: number }>;
  cues: Cue[];
};

export type BuildResult = {
  outDir: string;
  composition: string;
  scene: string;
  duration: number;
  missingLines: string[];
};

export async function buildComposition(show: Show): Promise<BuildResult> {
  const dir = showWorkingDir(show.id);
  await fs.mkdir(dir, { recursive: true });

  const segments: Segment[] = [];
  const missing: string[] = [];
  let cursor = 0;

  for (const line of show.dialogue) {
    const meta = await readLineMeta(show.id, line.id);
    if (!meta) {
      missing.push(line.id);
      continue;
    }
    const duration = +(meta.durationMs / 1000).toFixed(3);
    const words = meta.words;
    const cues = buildMouthCues(words, duration);
    segments.push({
      id: line.id,
      speaker: line.speakerId,
      audioUrl: meta.audioFile,
      startAt: +cursor.toFixed(3),
      duration,
      text: line.text,
      words,
      cues,
    });
    cursor += duration + GAP_S;
  }

  const totalDuration = +Math.max(0, cursor - GAP_S + 0.5).toFixed(3);
  const speakers = [...new Set(segments.map((s) => s.speaker))];
  const sceneData = {
    scene: show.id,
    duration: totalDuration,
    speakers,
    segments,
  };
  const sceneJsPath = path.join(dir, 'scene.js');
  await fs.writeFile(
    sceneJsPath,
    `window.SCENE_DATA = ${JSON.stringify(sceneData, null, 2)};\n`,
  );

  const html = renderHtml(show, segments, totalDuration);
  const compPath = path.join(dir, 'composition.html');
  await fs.writeFile(compPath, html, 'utf8');

  return {
    outDir: dir,
    composition: compPath,
    scene: sceneJsPath,
    duration: totalDuration,
    missingLines: missing,
  };
}

function renderHtml(
  show: Show,
  segments: Segment[],
  totalDuration: number,
): string {
  const bgImg = show.scene
    ? `<img class="scene-bg" src="${svgDataUri(show.scene.svg)}" alt="" />`
    : '';

  const characters = show.characters
    .map((c) => {
      const left = (c.x * 100).toFixed(2);
      const top = (c.y * 100).toFixed(2);
      const baseW = STAGE_W * 0.2;
      const inlineSvg = ensureSvgId(c.svg, `${c.id}-rig`);
      return `
        <div class="slot" style="left:${left}%;top:${top}%;width:${baseW}px;transform:translate(-50%,-100%) scale(${c.scale.toFixed(2)});z-index:${Math.round(c.y * 1000)};">
          ${inlineSvg}
        </div>`;
    })
    .join('\n');

  const audioTags = segments
    .map(
      (s) =>
        `      <audio id="aud-${s.id}" data-start="${s.startAt}" data-duration="${s.duration.toFixed(2)}" data-track-index="0" data-volume="1" src="${s.audioUrl}"></audio>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(show.name)}</title>
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      [data-composition-id="${show.id}"] {
        position: relative; width: ${STAGE_W}px; height: ${STAGE_H}px;
        background: #111; color: #1a1a1a; overflow: hidden;
      }
      .scene-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
      .slot { position: absolute; transform-origin: bottom center; }
      .slot svg { width: 100%; height: auto; display: block; }
      .mouth-group { opacity: 0; }
      .mouth-group.mouth-X { opacity: 1; }
    </style>
  </head>
  <body>
    <div data-composition-id="${show.id}" data-width="${STAGE_W}" data-height="${STAGE_H}" data-start="0" data-duration="${totalDuration}">
      ${bgImg}
      ${characters}
${audioTags}
      <script src="scene.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
      <script>
        (function () {
          var S = window.SCENE_DATA;
          if (!S) return;
          S.speakers.forEach(function (sp) {
            gsap.set("#" + sp + "-rig .mouth-group", { opacity: 0 });
            gsap.set("#" + sp + "-rig .mouth-X", { opacity: 1 });
          });
          window.__timelines = window.__timelines || {};
          var tl = gsap.timeline({ paused: true });
          S.segments.forEach(function (seg) {
            var rigSel = "#" + seg.speaker + "-rig";
            var prev = "X";
            seg.cues.forEach(function (cue) {
              var t = seg.startAt + cue.start;
              if (cue.value === prev) return;
              tl.set(rigSel + " .mouth-" + prev, { opacity: 0 }, t);
              tl.set(rigSel + " .mouth-" + cue.value, { opacity: 1 }, t);
              prev = cue.value;
            });
            var endT = seg.startAt + seg.duration;
            if (prev !== "X") {
              tl.set(rigSel + " .mouth-" + prev, { opacity: 0 }, endT);
              tl.set(rigSel + " .mouth-X", { opacity: 1 }, endT);
            }
          });
          window.__timelines["${show.id}"] = tl;
        })();
      </script>
    </div>
  </body>
</html>
`;
}

function ensureSvgId(svg: string, id: string): string {
  if (/<svg[^>]*\bid=/.test(svg)) {
    return svg.replace(/<svg([^>]*)\bid="[^"]*"/, `<svg$1 id="${id}"`);
  }
  return svg.replace(/<svg/, `<svg id="${id}"`);
}

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
