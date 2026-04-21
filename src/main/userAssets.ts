import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

export type UserAsset = {
  id: string;
  name: string;
  type: 'character' | 'scene';
  svg: string;
};

function assetsDir(type: 'character' | 'scene'): string {
  return path.join(app.getPath('userData'), 'assets', `${type}s`);
}

function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

export async function saveUserAsset(
  type: 'character' | 'scene',
  name: string,
  svg: string,
): Promise<UserAsset> {
  const dir = assetsDir(type);
  await fs.mkdir(dir, { recursive: true });
  const id = `${type}:user/${slug(name) || 'asset'}-${crypto
    .randomBytes(3)
    .toString('hex')}`;
  const file = `${id.split('/').pop()}.svg`;
  await fs.writeFile(path.join(dir, file), svg, 'utf8');
  return { id, name, type, svg };
}

export async function deleteUserAsset(id: string): Promise<void> {
  // id shape: "<type>:user/<stem>"
  const m = id.match(/^(character|scene):user\/(.+)$/);
  if (!m) return;
  const [, type, stem] = m;
  const file = path.join(assetsDir(type as 'character' | 'scene'), `${stem}.svg`);
  try {
    await fs.unlink(file);
  } catch {
    // ignore — file might already be gone
  }
}

export async function listUserAssets(): Promise<UserAsset[]> {
  const out: UserAsset[] = [];
  for (const type of ['character', 'scene'] as const) {
    const dir = assetsDir(type);
    let entries: string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.toLowerCase().endsWith('.svg')) continue;
      const svg = await fs.readFile(path.join(dir, file), 'utf8');
      const stem = file.replace(/\.svg$/i, '');
      const name = stem
        .replace(/-[0-9a-f]{6}$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      out.push({
        id: `${type}:user/${stem}`,
        name,
        type,
        svg,
      });
    }
  }
  return out;
}
