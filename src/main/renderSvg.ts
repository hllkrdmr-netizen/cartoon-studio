import { BrowserWindow } from 'electron';

// Render an SVG to a PNG buffer by loading it in a hidden BrowserWindow and
// capturing the painted output. Used to give the vision LLM a flat raster
// view of arbitrary SVG character art when our geometry-based mouth
// heuristic fails on it.
export async function renderSvgToPng(
  svg: string,
  size = 512,
): Promise<Buffer> {
  const win = new BrowserWindow({
    show: false,
    width: size,
    height: size,
    webPreferences: {
      offscreen: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  try {
    const html = `<!doctype html>
<html>
  <head>
    <style>
      html, body { margin: 0; padding: 0; background: #ffffff; }
      svg { width: 100vw; height: 100vh; display: block; }
    </style>
  </head>
  <body>${svg}</body>
</html>`;
    const url = `data:text/html;base64,${Buffer.from(html).toString('base64')}`;
    await win.loadURL(url);
    // Brief settle so GSAP-style late paints land before capture.
    await new Promise((r) => setTimeout(r, 200));
    const img = await win.webContents.capturePage();
    return img.toPNG();
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}
