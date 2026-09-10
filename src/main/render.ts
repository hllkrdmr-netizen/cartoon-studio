import { spawn } from 'node:child_process';
import { dialog, BrowserWindow, app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { showWorkingDir } from './showStore';
import { nodeBin, nodeEnv, ffmpegPath, chromePath } from './binaries';
import { buildMinoTimelineJs } from './minoMotion';

export type RenderProgress =
  | { type: 'start'; outputPath: string }
  | { type: 'log'; line: string }
  | { type: 'done'; outputPath: string }
  | { type: 'error'; message: string };

function hyperframesEntry(): string {
  // Resolve from the running app — works in dev and packaged.
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      'hyperframes',
      'dist',
      'cli.js',
    );
  }
  return path.join(
    app.getAppPath(),
    'node_modules',
    'hyperframes',
    'dist',
    'cli.js',
  );
}

/**
 * The base composition already owns lip-sync and camera motion. For the Mino
 * pilot we append one extra deterministic GSAP layer immediately before
 * HyperFrames renders the file. HyperFrames seeks the same paused timeline
 * frame-by-frame, so these character actions stay in sync in the final MP4.
 *
 * We identify Mino by the data-character="mino" marker embedded in mino.svg,
 * then recover the generated character instance id from ensureSvgId().
 */
async function injectMinoMotion(dir: string): Promise<void> {
  const file = path.join(dir, 'index.html');
  let html: string;
  try {
    html = await fs.readFile(file, 'utf8');
  } catch {
    return;
  }

  if (!html.includes('data-character="mino"')) return;
  if (html.includes('data-mino-motion="1"')) return;

  const idMatch = html.match(
    /<svg\b[^>]*\bid="([^"]+)-rig"[^>]*\bdata-character="mino"|<svg\b[^>]*\bdata-character="mino"[^>]*\bid="([^"]+)-rig"/,
  );
  const characterId = idMatch?.[1] ?? idMatch?.[2];
  if (!characterId) return;

  const durationMatch = html.match(/data-duration="([0-9.]+)"/);
  const duration = durationMatch ? Number(durationMatch[1]) : 70;
  if (!Number.isFinite(duration) || duration <= 0) return;

  const motion = buildMinoTimelineJs(characterId, duration);
  const injected = `\n<script data-mino-motion="1">\n(function () {\n  var park = window.__agentPark;\n  if (!park || !park.tl) return;\n  var tl = park.tl;\n${motion}\n})();\n</script>\n`;

  html = html.replace('</body>', `${injected}</body>`);
  await fs.writeFile(file, html, 'utf8');
}

export async function renderShow(
  showId: string,
  win: BrowserWindow,
): Promise<string> {
  const r = await dialog.showSaveDialog(win, {
    title: 'Export rendered MP4',
    defaultPath: `${showId}.mp4`,
    filters: [{ name: 'MP4', extensions: ['mp4'] }],
  });
  if (r.canceled || !r.filePath) throw new Error('cancelled');
  const outputPath = r.filePath;
  const dir = showWorkingDir(showId);
  const entry = hyperframesEntry();

  // Add the Mino action layer after the composition has been built but before
  // HyperFrames loads it. Non-Mino shows are left untouched.
  await injectMinoMotion(dir);

  // Resolve bundled binaries up front so a missing dep fails before we
  // emit "start" — the render UI can stay in idle state.
  const ff = ffmpegPath();
  const chrome = chromePath();

  emit(win, { type: 'start', outputPath });

  return new Promise<string>((resolve, reject) => {
    // Spawn Electron itself as a Node runtime (ELECTRON_RUN_AS_NODE=1)
    // so we don't need a bundled Node binary. ffmpeg is found by
    // prepending its directory to PATH (HyperFrames spawns bare
    // `ffmpeg` internally). Chrome is pinned via two env vars Puppeteer
    // and HyperFrames both honor.
    const ffDir = path.dirname(ff);
    const child = spawn(
      nodeBin,
      [entry, 'render', dir, '-o', outputPath, '--quiet'],
      {
        cwd: dir,
        env: {
          ...process.env,
          ...nodeEnv,
          PATH: `${ffDir}${path.delimiter}${process.env.PATH ?? ''}`,
          PUPPETEER_EXECUTABLE_PATH: chrome,
          PRODUCER_HEADLESS_SHELL_PATH: chrome,
        },
      },
    );

    child.stdout.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n').filter(Boolean)) {
        emit(win, { type: 'log', line });
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n').filter(Boolean)) {
        emit(win, { type: 'log', line });
      }
    });
    child.on('error', (e) => {
      emit(win, { type: 'error', message: e.message });
      reject(e);
    });
    child.on('close', (code) => {
      if (code === 0) {
        emit(win, { type: 'done', outputPath });
        resolve(outputPath);
      } else {
        const msg = `render exited with code ${code}.`;
        emit(win, { type: 'error', message: msg });
        reject(new Error(msg));
      }
    });
  });
}

function emit(win: BrowserWindow, p: RenderProgress): void {
  win.webContents.send('render:progress', p);
}
