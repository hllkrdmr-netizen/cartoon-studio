import { signal } from '@preact/signals-core';
import type { DefaultAsset } from '../shared/ipc';
import { openFormModal } from './modal';
import { notify, notifyError } from './notify';

export const defaults = signal<DefaultAsset[]>([]);
export const userAssets = signal<DefaultAsset[]>([]);

// In-flight generate/upload jobs. The library grid renders a skeleton tile
// for each entry so the user knows something is happening — Recraft can
// take 20-40s and uploads run vision-LLM mouth detection.
export type PendingAsset = {
  tempId: string;
  type: 'character' | 'scene';
  name: string;
  source: 'generate' | 'upload';
};
export const pendingAssets = signal<PendingAsset[]>([]);

let pendingCounter = 0;
function pushPending(p: Omit<PendingAsset, 'tempId'>): string {
  const tempId = `pending-${++pendingCounter}`;
  pendingAssets.value = [...pendingAssets.value, { ...p, tempId }];
  return tempId;
}
function popPending(tempId: string): void {
  pendingAssets.value = pendingAssets.value.filter((p) => p.tempId !== tempId);
}

export async function loadDefaults(): Promise<void> {
  const [d, u] = await Promise.all([
    window.api.defaultsList(),
    window.api.userAssetsList(),
  ]);
  defaults.value = d;
  userAssets.value = u;
}

export function isUserAsset(asset: DefaultAsset): boolean {
  return asset.id.includes(':user/');
}

export async function uploadAsset(type: 'character' | 'scene'): Promise<void> {
  try {
    const r = await window.api.uploadAsset(type);
    if (!r) return;
    if (r.warning) notify({ kind: 'warning', message: r.warning });
    userAssets.value = [...userAssets.value, r.asset];
  } catch (err) {
    notifyError(err, `Upload failed.`);
  }
}

export async function generateAsset(type: 'character' | 'scene'): Promise<void> {
  const result = await openFormModal({
    title: type === 'character' ? 'Generate character' : 'Generate scene',
    description:
      type === 'character'
        ? 'Describe a character. Recraft V4 will draw it as an SVG; the mouth gets auto-rigged for lip sync.'
        : 'Describe a scene. Recraft V4 will draw it as a 16:9 SVG backdrop.',
    fields: [
      {
        id: 'prompt',
        label: 'Description',
        type: 'textarea',
        rows: 3,
        required: true,
        placeholder:
          type === 'character'
            ? 'e.g. grumpy barista in a hoodie, side profile'
            : 'e.g. snowy bus stop at dusk',
      },
      {
        id: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        placeholder: 'Shown in your library',
      },
    ],
    submitLabel: 'Generate',
  });
  if (!result) return;
  const prompt = result.prompt;
  const name = result.name || prompt.split(' ').slice(0, 3).join(' ');
  const tempId = pushPending({ type, name, source: 'generate' });
  try {
    const a =
      type === 'character'
        ? await window.api.generateCharacter(prompt, name)
        : await window.api.generateScene(prompt, name);
    userAssets.value = [...userAssets.value, a];
  } catch (err) {
    notifyError(err, 'Generate failed.');
  } finally {
    popPending(tempId);
  }
}

export async function deleteUserAsset(id: string, name: string): Promise<void> {
  const ok = window.confirm(
    `Delete "${name}" from your library? This cannot be undone.`,
  );
  if (!ok) return;
  try {
    await window.api.userAssetsDelete(id);
    userAssets.value = userAssets.value.filter((a) => a.id !== id);
  } catch (err) {
    notifyError(err, 'Delete failed.');
  }
}
