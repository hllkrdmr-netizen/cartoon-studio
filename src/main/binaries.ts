import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// Resolves paths to the bundled runtime binaries (Node, ffmpeg, Chrome).
//
// In packaged builds these live under process.resourcesPath after Forge
// extraResource. In dev they live under node_modules / resources/. Both
// paths are exposed via the same getter so the rest of the main process
// doesn't have to branch on app.isPackaged.

const isWin = process.platform === 'win32';
const RES = process.resourcesPath;
const APP = app.getAppPath();

// 1. Node — Electron itself runs as Node when ELECTRON_RUN_AS_NODE=1 is
// in the spawn env. No separate Node binary bundled. Requires
// FuseV1Options.RunAsNode=true in forge.config.ts.
export const nodeBin = process.execPath;
export const nodeEnv: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: '1' };

// 2. ffmpeg — bundled via ffmpeg-static. In dev the package's default
// export is the absolute path inside node_modules; in packaged builds
// the binary is copied to process.resourcesPath via extraResource.
export function ffmpegPath(): string {
  if (app.isPackaged) {
    return path.join(RES, isWin ? 'ffmpeg.exe' : 'ffmpeg');
  }
  // Avoid a static `require` so Vite's main bundle doesn't try to inline
  // the binary as an asset. The path string is what we want.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ff = require('ffmpeg-static') as string | null;
  if (!ff) {
    throw new Error(
      'ffmpeg-static package missing — run `npm install` to fetch the binary.',
    );
  }
  return ff;
}

// 3. Chrome (chrome-headless-shell) — bundled via @puppeteer/browsers
// during postinstall. Layout:
//   resources/chrome/chrome-headless-shell/<platform_arch-version>/chrome-headless-shell-<platform-arch>/<binary>
// Version directory name is dynamic; we discover it at runtime so an
// upgrade of the chrome download doesn't require a code change.
export function chromePath(): string {
  const root = app.isPackaged
    ? path.join(RES, 'chrome', 'chrome-headless-shell')
    : path.join(APP, 'resources', 'chrome', 'chrome-headless-shell');

  let versioned: string | undefined;
  try {
    versioned = fs
      .readdirSync(root)
      .find((n) => !n.startsWith('.') && fs.statSync(path.join(root, n)).isDirectory());
  } catch (err) {
    throw new Error(
      `chrome-headless-shell missing at ${root}. Run \`npm run setup:chrome\`. (${(err as Error).message})`,
    );
  }
  if (!versioned) {
    throw new Error(
      `No chrome-headless-shell version found under ${root}. Run \`npm run setup:chrome\`.`,
    );
  }

  const platformDir = fs
    .readdirSync(path.join(root, versioned))
    .find((n) => n.startsWith('chrome-headless-shell-'));
  if (!platformDir) {
    throw new Error(
      `chrome-headless-shell platform dir missing under ${path.join(root, versioned)}.`,
    );
  }

  const exe = isWin ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  return path.join(root, versioned, platformDir, exe);
}
