import { effect, signal } from '@preact/signals-core';
import type { DefaultAsset } from '../../shared/ipc';
import { svgToDataUri, uid } from '../util';
import { currentShow, mutate } from '../state';

export const defaults = signal<DefaultAsset[]>([]);

export async function loadDefaults(): Promise<void> {
  defaults.value = await window.api.defaultsList();
}

export function mountLibrary(root: HTMLElement): void {
  effect(() => {
    const items = defaults.value;
    const characters = items.filter((a) => a.type === 'character');
    const scenes = items.filter((a) => a.type === 'scene');

    root.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="p-3 border-b border-neutral-800">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Library</h2>
        </div>
        <div class="flex-1 overflow-y-auto p-3 space-y-4">
          <section>
            <h3 class="text-xs uppercase tracking-wide text-neutral-500 mb-2">Scenes</h3>
            <div class="grid grid-cols-2 gap-2" data-section="scenes"></div>
          </section>
          <section>
            <h3 class="text-xs uppercase tracking-wide text-neutral-500 mb-2">Characters</h3>
            <div class="grid grid-cols-2 gap-2" data-section="characters"></div>
          </section>
        </div>
      </div>
    `;

    const renderTile = (asset: DefaultAsset) => {
      const tile = document.createElement('button');
      tile.className =
        'group rounded border border-neutral-800 bg-neutral-900 hover:border-neutral-600 p-2 text-left flex flex-col gap-1';
      tile.innerHTML = `
        <div class="aspect-square rounded bg-neutral-950 flex items-center justify-center overflow-hidden">
          <img src="${svgToDataUri(asset.svg)}" class="max-w-full max-h-full" alt="${asset.name}" />
        </div>
        <span class="text-xs text-neutral-300 truncate">${asset.name}</span>
      `;
      tile.draggable = true;
      tile.addEventListener('dragstart', (ev) => {
        ev.dataTransfer?.setData('application/x-agentpark-asset', asset.id);
      });
      tile.addEventListener('click', () => addToShow(asset));
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
  });
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
