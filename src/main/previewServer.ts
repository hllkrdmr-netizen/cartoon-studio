import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { showWorkingDir } from './showStore';

let server: http.Server | null = null;
let port = 0;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export function startPreviewServer(): Promise<number> {
  if (server) return Promise.resolve(port);
  return new Promise((resolve, reject) => {
    const s = http.createServer((req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://localhost');
        // /<showId>/<file...>
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length < 2) {
          res.writeHead(404);
          res.end('not found');
          return;
        }
        const [showId, ...rest] = parts;
        const root = showWorkingDir(showId);
        const target = path.normalize(path.join(root, ...rest));
        if (!target.startsWith(root)) {
          res.writeHead(403);
          res.end('forbidden');
          return;
        }
        fs.stat(target, (err, st) => {
          if (err || !st.isFile()) {
            res.writeHead(404);
            res.end('not found');
            return;
          }
          const ext = path.extname(target).toLowerCase();
          res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
          res.setHeader('Cache-Control', 'no-store');
          fs.createReadStream(target).pipe(res);
        });
      } catch (e) {
        res.writeHead(500);
        res.end(String(e));
      }
    });
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
        server = s;
        resolve(port);
      } else {
        reject(new Error('failed to bind preview server'));
      }
    });
  });
}

export async function previewUrl(showId: string): Promise<string> {
  const p = await startPreviewServer();
  return `http://127.0.0.1:${p}/${showId}/index.html`;
}
