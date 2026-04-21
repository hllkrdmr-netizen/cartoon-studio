import { spawn } from 'node:child_process';
import { dialog, BrowserWindow, app } from 'electron';
import path from 'node:path';
import { showWorkingDir } from './showStore';

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

  emit(win, { type: 'start', outputPath });

  return new Promise<string>((resolve, reject) => {
    // Use the user's installed Node (PATH). Required because hyperframes
    // spawns Chrome and ffmpeg in subprocesses; running it under the
    // Electron binary's bundled Chromium won't behave the same.
    const child = spawn(
      process.platform === 'win32' ? 'node.exe' : 'node',
      [entry, 'render', dir, '-o', outputPath, '--quiet'],
      {
        cwd: dir,
        env: { ...process.env },
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
        const msg = `render exited with code ${code}. Make sure ffmpeg is on PATH and Chrome is installed.`;
        emit(win, { type: 'error', message: msg });
        reject(new Error(msg));
      }
    });
  });
}

function emit(win: BrowserWindow, p: RenderProgress): void {
  win.webContents.send('render:progress', p);
}
