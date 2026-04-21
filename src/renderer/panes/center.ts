import { effect } from '@preact/signals-core';
import type { DefaultAsset } from '../../shared/ipc';
import { currentShow, mutate, selection } from '../state';
import { svgToDataUri, uid } from '../util';

const MIME = 'application/x-agentpark-asset';

export function mountCenter(root: HTMLElement): void {
  root.innerHTML = `
    <div class="flex flex-col h-full">
      <div class="p-3 border-b border-neutral-800 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Preview</h2>
        <span class="text-xs text-neutral-500">drag tiles from the library · drag characters to reposition · corner-handle to scale</span>
      </div>
      <div class="flex-1 flex items-center justify-center bg-neutral-950 p-6">
        <div id="preview-stage" class="relative bg-neutral-900 rounded shadow-inner aspect-video w-full max-w-3xl overflow-hidden"></div>
      </div>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#preview-stage')!;

  stage.addEventListener('dragover', (ev) => {
    if (ev.dataTransfer?.types.includes(MIME)) {
      ev.preventDefault();
    }
  });

  stage.addEventListener('drop', async (ev) => {
    const id = ev.dataTransfer?.getData(MIME);
    if (!id) return;
    ev.preventDefault();
    const defaults = await window.api.defaultsList();
    const asset = defaults.find((a) => a.id === id);
    if (!asset) return;
    const rect = stage.getBoundingClientRect();
    const x = clamp01((ev.clientX - rect.left) / rect.width);
    const y = clamp01((ev.clientY - rect.top) / rect.height);
    addAsset(asset, x, y);
  });

  effect(() => {
    const show = currentShow.value;
    const selected = selection.value;
    stage.replaceChildren();

    if (show.scene) {
      const bg = document.createElement('img');
      bg.src = svgToDataUri(show.scene.svg);
      bg.className = 'absolute inset-0 w-full h-full object-cover pointer-events-none';
      stage.appendChild(bg);
    } else {
      const empty = document.createElement('div');
      empty.className =
        'absolute inset-0 flex items-center justify-center text-xs text-neutral-600 pointer-events-none';
      empty.textContent = 'Drop or click a scene from the library';
      stage.appendChild(empty);
    }

    const sorted = [...show.characters].sort((a, b) => a.y - b.y);
    for (const c of sorted) {
      const isSelected =
        selected.type === 'character' && selected.id === c.id;
      const slot = document.createElement('div');
      slot.className = `absolute select-none ${isSelected ? 'outline outline-2 outline-emerald-400/80' : ''}`;
      slot.style.left = `${c.x * 100}%`;
      slot.style.top = `${c.y * 100}%`;
      slot.style.transform = `translate(-50%, -100%) scale(${c.scale})`;
      slot.style.transformOrigin = 'bottom center';
      slot.style.width = '20%';
      slot.style.touchAction = 'none';
      slot.style.cursor = 'grab';
      slot.dataset.characterId = c.id;

      const img = document.createElement('img');
      img.src = svgToDataUri(c.svg);
      img.className = 'w-full h-auto pointer-events-none';
      img.draggable = false;
      slot.appendChild(img);

      attachDrag(slot, stage, c.id);

      if (isSelected) {
        const handle = document.createElement('div');
        handle.className =
          'absolute -bottom-1 -right-1 w-3 h-3 rounded-sm bg-emerald-400 cursor-nwse-resize';
        handle.style.touchAction = 'none';
        attachResize(handle, slot, stage, c.id);
        slot.appendChild(handle);
      }

      stage.appendChild(slot);
    }
  });
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function addAsset(asset: DefaultAsset, x: number, y: number): void {
  if (asset.type === 'scene') {
    mutate((s) => ({
      ...s,
      scene: { id: asset.id, name: asset.name, svg: asset.svg },
    }));
    return;
  }
  const existing = currentShow.value.characters.length;
  const newId = uid('char');
  mutate((s) => ({
    ...s,
    characters: [
      ...s.characters,
      {
        id: newId,
        name: asset.name,
        svg: asset.svg,
        x,
        y,
        scale: 1,
        z: existing,
      },
    ],
  }));
  selection.value = { type: 'character', id: newId };
}

function attachDrag(
  slot: HTMLElement,
  stage: HTMLElement,
  characterId: string,
): void {
  let dragging = false;

  slot.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    selection.value = { type: 'character', id: characterId };
    dragging = true;
    slot.setPointerCapture(ev.pointerId);
    slot.style.cursor = 'grabbing';
  });

  slot.addEventListener('pointermove', (ev) => {
    if (!dragging) return;
    const rect = stage.getBoundingClientRect();
    const x = clamp01((ev.clientX - rect.left) / rect.width);
    const y = clamp01((ev.clientY - rect.top) / rect.height);
    mutate((s) => ({
      ...s,
      characters: s.characters.map((c) =>
        c.id === characterId ? { ...c, x, y, z: Math.round(y * 1000) } : c,
      ),
    }));
  });

  slot.addEventListener('pointerup', (ev) => {
    dragging = false;
    slot.releasePointerCapture(ev.pointerId);
    slot.style.cursor = 'grab';
  });
}

function attachResize(
  handle: HTMLElement,
  slot: HTMLElement,
  stage: HTMLElement,
  characterId: string,
): void {
  let resizing = false;
  let startScale = 1;
  let startDist = 0;

  handle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    resizing = true;
    handle.setPointerCapture(ev.pointerId);
    const rect = slot.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom;
    startDist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
    const c = currentShow.value.characters.find((x) => x.id === characterId);
    startScale = c?.scale ?? 1;
  });

  handle.addEventListener('pointermove', (ev) => {
    if (!resizing) return;
    const slotRect = slot.getBoundingClientRect();
    const cx = slotRect.left + slotRect.width / 2;
    const cy = slotRect.bottom;
    const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
    if (startDist <= 0) return;
    const ratio = dist / startDist;
    const next = clamp(startScale * ratio, 0.2, 3);
    mutate((s) => ({
      ...s,
      characters: s.characters.map((c) =>
        c.id === characterId ? { ...c, scale: next } : c,
      ),
    }));
  });

  handle.addEventListener('pointerup', (ev) => {
    resizing = false;
    handle.releasePointerCapture(ev.pointerId);
  });
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
