import { effect, signal } from '@preact/signals-core';
import type { DefaultAsset } from '../../shared/ipc';
import { svgToDataUri, uid } from '../util';
import { currentShow, mutate } from '../state';

export const defaults = signal<DefaultAsset[]>([]);
export const userAssets = signal<DefaultAsset[]>([]);

export async function loadDefaults(): Promise<void> {
  const [d, u] = await Promise.all([
    window.api.defaultsList(),
    window.api.userAssetsList(),
  ]);
  defaults.value = d;
  userAssets.value = u;
}

export function mountLibrary(root: HTMLElement): void {
  effect(() => {
    const items = [...defaults.value, ...userAssets.value];
    const characters = items.filter((a) => a.type === 'character');
    const scenes = items.filter((a) => a.type === 'scene');

    root.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="p-3 border-b border-neutral-800">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Library</h2>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
          <section>
            <div class="flex items-center justify-between mb-2 gap-1">
              <h3 class="text-xs uppercase tracking-wide text-neutral-500">Scenes</h3>
              <div class="flex gap-1">
                <button data-upload="scene" class="text-[10px] rounded border border-neutral-700 hover:border-neutral-500 px-1.5 py-0.5">Upload</button>
                <button data-generate="scene" class="text-[10px] rounded border border-neutral-700 hover:border-neutral-500 px-1.5 py-0.5">+ Generate</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2" data-section="scenes"></div>
          </section>
          <section>
            <div class="flex items-center justify-between mb-2 gap-1">
              <h3 class="text-xs uppercase tracking-wide text-neutral-500">Characters</h3>
              <div class="flex gap-1">
                <button data-upload="character" class="text-[10px] rounded border border-neutral-700 hover:border-neutral-500 px-1.5 py-0.5">Upload</button>
                <button data-generate="character" class="text-[10px] rounded border border-neutral-700 hover:border-neutral-500 px-1.5 py-0.5">+ Generate</button>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2" data-section="characters"></div>
          </section>
        </div>
      </div>
    `;

    const renderTile = (asset: DefaultAsset) => {
      const isUserAsset = asset.id.includes(':user/');
      const tile = document.createElement('div');
      tile.className =
        'group relative rounded border border-neutral-800 bg-neutral-900 hover:border-neutral-600 p-2 text-left flex flex-col gap-1 cursor-pointer';
      tile.innerHTML = `
        <div class="aspect-square rounded bg-neutral-950 flex items-center justify-center overflow-hidden">
          <img src="${svgToDataUri(asset.svg)}" class="max-w-full max-h-full" alt="${asset.name}" draggable="false" />
        </div>
        <span class="text-xs text-neutral-300 truncate">${asset.name}</span>
        ${
          isUserAsset
            ? `<button data-action="delete-asset"
                 class="absolute top-1 right-1 hidden group-hover:flex items-center justify-center w-5 h-5 rounded bg-neutral-950/80 hover:bg-red-600 text-neutral-300 hover:text-white text-xs"
                 title="Delete from library">×</button>`
            : ''
        }
      `;
      tile.draggable = true;
      tile.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('application/x-agentpark-asset', asset.id);
      });
      tile.addEventListener('click', (ev) => {
        // Don't add to show when the user clicked the delete button.
        if ((ev.target as HTMLElement).closest('[data-action="delete-asset"]')) {
          return;
        }
        addToShow(asset);
      });
      tile
        .querySelector<HTMLButtonElement>('[data-action="delete-asset"]')
        ?.addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const ok = window.confirm(
            `Delete "${asset.name}" from your library? This cannot be undone.`,
          );
          if (!ok) return;
          try {
            await window.api.userAssetsDelete(asset.id);
            userAssets.value = userAssets.value.filter(
              (a) => a.id !== asset.id,
            );
          } catch (err) {
            window.alert(`Delete failed: ${(err as Error).message}`);
          }
        });
      return tile;
    };

    const sceneRoot = root.querySelector<HTMLDivElement>(
      '[data-section="scenes"]',
    )!;
    scenes.forEach((s) => sceneRoot.appendChild(renderTile(s)));

    const charRoot = root.querySelector<HTMLDivElement>(
      '[data-section="characters"]',
    )!;
    characters.forEach((c) => charRoot.appendChild(renderTile(c)));

    root
      .querySelector<HTMLButtonElement>('[data-generate="character"]')
      ?.addEventListener('click', () => promptAndGenerate('character'));
    root
      .querySelector<HTMLButtonElement>('[data-generate="scene"]')
      ?.addEventListener('click', () => promptAndGenerate('scene'));
    root
      .querySelector<HTMLButtonElement>('[data-upload="character"]')
      ?.addEventListener('click', () => promptAndUpload('character'));
    root
      .querySelector<HTMLButtonElement>('[data-upload="scene"]')
      ?.addEventListener('click', () => promptAndUpload('scene'));
  });
}

async function promptAndUpload(type: 'character' | 'scene'): Promise<void> {
  try {
    const r = await window.api.uploadAsset(type);
    if (!r) return;
    if (r.warning) window.alert(r.warning);
    userAssets.value = [...userAssets.value, r.asset];
  } catch (err) {
    window.alert(`Upload failed: ${(err as Error).message}`);
  }
}

async function promptAndGenerate(type: 'character' | 'scene'): Promise<void> {
  const prompt = window.prompt(
    type === 'character'
      ? 'Describe a character (e.g. "grumpy barista in a hoodie"):'
      : 'Describe a scene (e.g. "snowy bus stop at dusk"):',
  );
  if (!prompt) return;
  const name = window.prompt('Name this asset:', prompt.split(' ').slice(0, 3).join(' '));
  if (!name) return;
  try {
    if (type === 'character') {
      const a = await window.api.generateCharacter(prompt, name);
      userAssets.value = [...userAssets.value, a];
    } else {
      const a = await window.api.generateScene(prompt, name);
      userAssets.value = [...userAssets.value, a];
    }
  } catch (err) {
    window.alert(`Generate failed: ${(err as Error).message}`);
  }
}

function addToShow(asset: DefaultAsset): void {
  if (asset.type === 'scene') {
    mutate((s) => ({
      ...s,
      scene: { id: asset.id, name: asset.name, svg: asset.svg },
    }));
  } else {
    const existing = currentShow.value.characters.length;
    mutate((s) => ({
      ...s,
      characters: [
        ...s.characters,
        {
          id: uid('char'),
          name: asset.name,
          svg: asset.svg,
          x: 0.25 + (existing % 3) * 0.25,
          y: 0.6,
          scale: 1,
          z: existing,
        },
      ],
    }));
  }
}
