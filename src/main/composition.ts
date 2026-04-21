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
  // Write as index.html so hyperframes render auto-discovers the composition
  // when we point it at the show working dir.
  const compPath = path.join(dir, 'index.html');
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
      html, body {
        width: 100%; height: 100%; overflow: hidden; background: #111;
      }
      body {
        display: grid; place-items: center;
      }
      [data-composition-id="${show.id}"] {
        position: relative; width: ${STAGE_W}px; height: ${STAGE_H}px;
        background: #111; color: #1a1a1a; overflow: hidden;
        transform-origin: center center;
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
        // Scale-to-fit: keeps the inner stage at native ${STAGE_W}x${STAGE_H}
        // (so HyperFrames render is pixel-accurate at full resolution) while
        // letting it fit any preview iframe size. When the viewport is
        // already ${STAGE_W}x${STAGE_H} (the render path), the scale is 1
        // and nothing changes.
        (function () {
          var root = document.querySelector('[data-composition-id]');
          if (!root) return;
          function fit() {
            var sx = window.innerWidth / ${STAGE_W};
            var sy = window.innerHeight / ${STAGE_H};
            var s = Math.min(sx, sy);
            // Avoid sub-pixel shimmer when scale ≈ 1
            if (Math.abs(s - 1) < 0.01) s = 1;
            root.style.transform = 'scale(' + s + ')';
          }
          fit();
          window.addEventListener('resize', fit);
        })();
      </script>
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

          // Tiny self-contained player. The hyperframes preview/render
          // wrap their own player around this same composition; this is
          // just so the in-app preview iframe is interactive.
          var audios = Array.prototype.slice.call(document.querySelectorAll('audio[id^="aud-"]'));
          var played = {};
          var t0 = 0;
          var elapsed = 0;
          var rafId = 0;
          function tick() {
            var now = performance.now() / 1000;
            var t = elapsed + (now - t0);
            tl.time(Math.min(t, S.duration));
            audios.forEach(function (a) {
              var s = parseFloat(a.dataset.start);
              if (!played[a.id] && t >= s) {
                played[a.id] = true;
                a.currentTime = Math.max(0, t - s);
                a.play().catch(function () {});
              }
            });
            window.parent && window.parent.postMessage({ type: 'agentpark:tick', t: t }, '*');
            if (t < S.duration) {
              rafId = requestAnimationFrame(tick);
            } else {
              window.__player.pause();
              window.parent && window.parent.postMessage({ type: 'agentpark:ended' }, '*');
            }
          }
          window.__player = {
            duration: S.duration,
            play: function () {
              if (rafId) return;
              t0 = performance.now() / 1000;
              rafId = requestAnimationFrame(tick);
            },
            pause: function () {
              if (rafId) {
                elapsed += performance.now() / 1000 - t0;
                cancelAnimationFrame(rafId);
                rafId = 0;
              }
              audios.forEach(function (a) { try { a.pause(); } catch (e) {} });
            },
            seek: function (t) {
              this.pause();
              elapsed = Math.max(0, Math.min(S.duration, t));
              played = {};
              audios.forEach(function (a) {
                a.pause();
                a.currentTime = 0;
                var s = parseFloat(a.dataset.start);
                if (elapsed >= s + parseFloat(a.dataset.duration)) {
                  played[a.id] = true;
                }
              });
              tl.time(elapsed);
            },
            stop: function () { this.seek(0); },
          };
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
