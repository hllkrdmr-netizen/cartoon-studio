import fs from 'node:fs/promises';
import path from 'node:path';
import { app } from 'electron';
import type { Show } from '../shared/show';
import { showWorkingDir } from './showStore';
import { readLineMeta } from './tts';
import { buildMouthCues, type Cue } from './cues';

const STAGE_W = 1920;
const STAGE_H = 1080;
const GAP_S = 0.35;

// Resolve the bundled GSAP so we can serve it locally. Loading from a CDN
// works in the Electron preview (it has network), but HyperFrames' headless
// Chrome during render can't reach cdn.jsdelivr.net — the inline timeline
// script then throws `gsap is not defined` and window.__timelines never gets
// registered, so the rendered MP4 has no lip sync.
//
// fs handles asar paths transparently, so app.getAppPath() works in both
// dev and packaged builds.
function gsapSource(): string {
  return path.join(app.getAppPath(), 'node_modules', 'gsap', 'dist', 'gsap.min.js');
}

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

  // Copy GSAP into the show dir so both the in-app preview and the
  // HyperFrames render path can load it locally (no CDN dependency).
  await fs.copyFile(gsapSource(), path.join(dir, 'gsap.min.js'));
  // Write the interactive-preview player as an external file. HyperFrames'
  // inline-script scanner flags `requestAnimationFrame`/`performance.now()`
  // and switches to screenshot capture mode, which breaks our render.
  // External <script src="..."> files are NOT scanned, so keeping the RAF
  // player off the inline path lets HyperFrames stay in normal mode (where
  // it seeks the registered timeline per frame) and the mouth animates.
  await fs.writeFile(path.join(dir, 'player.js'), PLAYER_JS, 'utf8');

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
      /* Take the composition out of flow and center it via transform so the
         1920x1080 box never forces scrollbars that steal from innerWidth /
         innerHeight — that was the root cause of the preview always looking
         "zoomed in" (scale was being computed against a scrollbar-shrunk
         viewport). */
      [data-composition-id="${show.id}"] {
        position: absolute; top: 50%; left: 50%;
        width: ${STAGE_W}px; height: ${STAGE_H}px;
        background: #111; color: #1a1a1a; overflow: hidden;
        transform-origin: center center;
        transform: translate(-50%, -50%) scale(1);
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
      <script src="gsap.min.js"></script>
      <script>
        // Scale-to-fit: keep the inner stage at native ${STAGE_W}x${STAGE_H}
        // (HyperFrames renders pixel-accurate at full resolution) while
        // letting it fit any preview iframe size. Reads clientWidth/Height
        // on documentElement so scrollbars (which Electron may add even with
        // overflow:hidden during initial layout) don't distort the fit.
        (function () {
          var root = document.querySelector('[data-composition-id]');
          if (!root) return;
          function fit() {
            var w = document.documentElement.clientWidth || window.innerWidth;
            var h = document.documentElement.clientHeight || window.innerHeight;
            var s = Math.min(w / ${STAGE_W}, h / ${STAGE_H});
            if (Math.abs(s - 1) < 0.01) s = 1;
            // Center via translate(-50%, -50%); scale is relative to the
            // element's own center (transform-origin: center center).
            root.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
          }
          fit();
          // Refit after layout / fonts settle. We intentionally avoid
          // requestAnimationFrame here so HyperFrames' inline-script scanner
          // stays happy and keeps normal render mode.
          window.addEventListener('resize', fit);
          window.addEventListener('load', fit);
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
          // Expose to the preview-only player.js for the RAF loop.
          window.__agentPark = { tl: tl, duration: S.duration };
        })();
      </script>
      <script>
        // Load the RAF/audio player only in interactive preview mode
        // (URL has ?preview=1). The render pipeline loads the page without
        // that flag, so the inline scripts HyperFrames scans stay clean of
        // performance.now / requestAnimationFrame, and HyperFrames seeks
        // the registered timeline directly per frame.
        if (location.search.indexOf('preview=1') >= 0) {
          var s = document.createElement('script');
          s.src = 'player.js';
          document.body.appendChild(s);
        }
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

// Preview-only RAF player. Loaded via <script src="player.js"> so it never
// appears in the inline scripts HyperFrames scans for non-determinism. Reads
// the registered timeline off window.__agentPark (set by the inline script).
const PLAYER_JS = `(function () {
  var ap = window.__agentPark;
  if (!ap || !ap.tl) return;
  var tl = ap.tl;
  var duration = ap.duration;
  var audios = Array.prototype.slice.call(
    document.querySelectorAll('audio[id^="aud-"]'),
  );
  var played = {};
  var t0 = 0;
  var elapsed = 0;
  var rafId = 0;
  function tick() {
    var now = performance.now() / 1000;
    var t = elapsed + (now - t0);
    tl.time(Math.min(t, duration));
    audios.forEach(function (a) {
      var s = parseFloat(a.dataset.start);
      if (!played[a.id] && t >= s) {
        played[a.id] = true;
        a.currentTime = Math.max(0, t - s);
        a.play().catch(function () {});
      }
    });
    window.parent.postMessage({ type: 'cartoonstudio:tick', t: t }, '*');
    if (t < duration) {
      rafId = requestAnimationFrame(tick);
    } else {
      doPause();
      window.parent.postMessage({ type: 'cartoonstudio:ended' }, '*');
    }
  }
  function doPlay() {
    if (rafId) return;
    if (elapsed >= duration) {
      elapsed = 0;
      played = {};
      audios.forEach(function (a) {
        try { a.pause(); } catch (e) {}
        a.currentTime = 0;
      });
      tl.time(0);
    }
    t0 = performance.now() / 1000;
    rafId = requestAnimationFrame(tick);
  }
  function doPause() {
    if (rafId) {
      elapsed += performance.now() / 1000 - t0;
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
    audios.forEach(function (a) { try { a.pause(); } catch (e) {} });
  }
  function doSeek(t) {
    doPause();
    elapsed = Math.max(0, Math.min(duration, t));
    played = {};
    audios.forEach(function (a) {
      a.pause();
      a.currentTime = 0;
      var s = parseFloat(a.dataset.start);
      if (elapsed >= s + parseFloat(a.dataset.duration)) played[a.id] = true;
    });
    tl.time(elapsed);
  }
  window.__player = {
    duration: duration,
    play: doPlay,
    pause: doPause,
    seek: doSeek,
    stop: function () { doSeek(0); },
  };
  window.addEventListener('message', function (ev) {
    var d = ev.data || {};
    if (!d.type) return;
    if (d.type === 'cartoonstudio:play') doPlay();
    else if (d.type === 'cartoonstudio:pause') doPause();
    else if (d.type === 'cartoonstudio:seek')
      doSeek(typeof d.t === 'number' ? d.t : 0);
    else if (d.type === 'cartoonstudio:restart') { doSeek(0); doPlay(); }
  });
  window.parent.postMessage(
    { type: 'cartoonstudio:ready', duration: duration },
    '*',
  );
})();
`;

function svgDataUri(svg: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
