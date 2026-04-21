import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';

function resourcesRoot(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'defaults');
  }
  // .vite/build/main.js -> ../../resources/defaults
  return path.join(__dirname, '..', '..', 'resources', 'defaults');
}

export type DefaultAsset = {
  id: string;
  name: string;
  type: 'character' | 'scene';
  svg: string;
};

function prettify(filename: string): string {
  return filename
    .replace(/\.svg$/i, '')
    .replace(/^scene-/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function listDir(
  dir: string,
  type: 'character' | 'scene',
): Promise<DefaultAsset[]> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: DefaultAsset[] = [];
  for (const file of entries) {
    if (!file.toLowerCase().endsWith('.svg')) continue;
    const full = path.join(dir, file);
    const svg = await fs.readFile(full, 'utf8');
    out.push({
      id: `${type}:${file.replace(/\.svg$/i, '')}`,
      name: prettify(file),
      type,
      svg,
    });
  }
  return out;
}

export async function listDefaults(): Promise<DefaultAsset[]> {
  const root = resourcesRoot();
  const [chars, scenes] = await Promise.all([
    listDir(path.join(root, 'characters'), 'character'),
    listDir(path.join(root, 'scenes'), 'scene'),
  ]);
  return [...chars, ...scenes];
}
