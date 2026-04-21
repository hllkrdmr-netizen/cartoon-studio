import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { ShowSchema, type Show, type ShowSummary } from '../shared/show';

function showsDir(): string {
  return path.join(app.getPath('userData'), 'shows');
}

export function showWorkingDir(showId: string): string {
  return path.join(showsDir(), showId);
}

function showJsonPath(showId: string): string {
  return path.join(showWorkingDir(showId), 'show.json');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function saveShow(show: Show): Promise<Show> {
  const updated: Show = { ...show, updatedAt: Date.now() };
  await ensureDir(showWorkingDir(updated.id));
  await fs.writeFile(
    showJsonPath(updated.id),
    JSON.stringify(updated, null, 2),
    'utf8',
  );
  return updated;
}

export async function loadShow(showId: string): Promise<Show> {
  const raw = await fs.readFile(showJsonPath(showId), 'utf8');
  return ShowSchema.parse(JSON.parse(raw));
}

export async function listShows(): Promise<ShowSummary[]> {
  await ensureDir(showsDir());
  const ids = await fs.readdir(showsDir());
  const out: ShowSummary[] = [];
  for (const id of ids) {
    try {
      const show = await loadShow(id);
      out.push({ id: show.id, name: show.name, updatedAt: show.updatedAt });
    } catch {
      // skip malformed dirs
    }
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteShow(showId: string): Promise<void> {
  await fs.rm(showWorkingDir(showId), { recursive: true, force: true });
}
