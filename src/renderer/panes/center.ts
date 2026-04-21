import { effect, signal } from '@preact/signals-core';
import type { DefaultAsset } from '../../shared/ipc';
import { currentShow, mutate, selection } from '../state';
import { svgToDataUri, uid } from '../util';

const MIME = 'application/x-agentpark-asset';
type Tab = 'editor' | 'preview';
const tab = signal<Tab>('editor');

// Module-level so the editor effect can see when a drag/resize is in flight
// and skip the DOM rebuild that would tear down the captured slot.
let interaction:
  | { kind: 'drag'; characterId: string }
  | { kind: 'resize'; characterId: string }
  | null = null;

export function mountCenter(root: HTMLElement): void {
  root.innerHTML = `
    <div class="flex flex-col h-full">
      <div class="p-2 border-b border-neutral-800 flex items-center justify-between gap-2">
        <div class="flex gap-1" id="tabs">
          <button data-tab="editor" class="text-xs px-3 py-1 rounded">Editor</button>
          <button data-tab="preview" class="text-xs px-3 py-1 rounded">Preview</button>
        </div>
        <span id="hint" class="text-xs text-neutral-500"></span>
      </div>
      <div id="tab-body" class="flex-1 overflow-hidden bg-neutral-950"></div>
    </div>
  `;

  root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      tab.value = btn.dataset.tab as Tab;
    });
  });

  const body = root.querySelector<HTMLDivElement>('#tab-body')!;
  const hint = root.querySelector<HTMLElement>('#hint')!;

  effect(() => {
    root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      const isActive = b.dataset.tab === tab.value;
      b.className = `text-xs px-3 py-1 rounded ${isActive ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:text-neutral-200'}`;
    });
    if (tab.value === 'editor') {
      hint.textContent =
        'drag tiles from the library · drag characters to reposition · corner-handle to scale';
      mountEditor(body);
    } else {
      hint.textContent = 'audio + lip sync runs from generated lines';
      void mountPreview(body);
    }
  });
}

// ---- Editor (drag/place/resize stage) ----

function mountEditor(body: HTMLElement): void {
  body.innerHTML = `
    <div class="h-full flex items-center justify-center p-6">
      <div id="preview-stage" class="relative bg-neutral-900 rounded shadow-inner aspect-video w-full max-w-3xl overflow-hidden"></div>
    </div>
  `;
  const stage = body.querySelector<HTMLDivElement>('#preview-stage')!;

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
    if (tab.value !== 'editor') return; // skip if hidden
    // Mid-interaction the slot DOM is mutated directly; rebuilding here
    // would orphan the captured pointer and stop the drag dead.
    if (interaction) return;
    const show = currentShow.value;
    const selected = selection.value;
    stage.replaceChildren();

    if (show.scene) {
      const bg = document.createElement('img');
      bg.src = svgToDataUri(show.scene.svg);
      bg.className =
        'absolute inset-0 w-full h-full object-cover pointer-events-none';
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

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
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
  let lastX = 0;
  let lastY = 0;

  slot.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    // Set the interaction flag BEFORE flipping the selection signal so the
    // editor effect (which subscribes to selection) bails out instead of
    // replacing this slot mid-drag.
    interaction = { kind: 'drag', characterId };
    selection.value = { type: 'character', id: characterId };
    slot.setPointerCapture(ev.pointerId);
    slot.style.cursor = 'grabbing';
  });

  slot.addEventListener('pointermove', (ev) => {
    if (interaction?.kind !== 'drag' || interaction.characterId !== characterId) return;
    const rect = stage.getBoundingClientRect();
    lastX = clamp01((ev.clientX - rect.left) / rect.width);
    lastY = clamp01((ev.clientY - rect.top) / rect.height);
    // Update the live DOM directly — bypass the store so the effect doesn't
    // re-render and orphan our captured slot. We commit on pointerup.
    slot.style.left = `${lastX * 100}%`;
    slot.style.top = `${lastY * 100}%`;
  });

  slot.addEventListener('pointerup', (ev) => {
    if (interaction?.kind !== 'drag' || interaction.characterId !== characterId) return;
    slot.releasePointerCapture(ev.pointerId);
    slot.style.cursor = 'grab';
    interaction = null;
    // Now commit. The effect will run, replace_children, and re-render with
    // the new position — visually identical to what's already on screen.
    mutate((s) => ({
      ...s,
      characters: s.characters.map((c) =>
        c.id === characterId
          ? { ...c, x: lastX || c.x, y: lastY || c.y, z: Math.round((lastY || c.y) * 1000) }
          : c,
      ),
    }));
  });
}

function attachResize(
  handle: HTMLElement,
  slot: HTMLElement,
  stage: HTMLElement,
  characterId: string,
): void {
  let startScale = 1;
  let startDist = 0;
  let lastScale = 1;

  handle.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    interaction = { kind: 'resize', characterId };
    handle.setPointerCapture(ev.pointerId);
    const rect = slot.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.bottom;
    startDist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
    const c = currentShow.value.characters.find((x) => x.id === characterId);
    startScale = c?.scale ?? 1;
    lastScale = startScale;
  });

  handle.addEventListener('pointermove', (ev) => {
    if (interaction?.kind !== 'resize' || interaction.characterId !== characterId) return;
    const slotRect = slot.getBoundingClientRect();
    const cx = slotRect.left + slotRect.width / 2;
    const cy = slotRect.bottom;
    const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy);
    if (startDist <= 0) return;
    const ratio = dist / startDist;
    lastScale = clamp(startScale * ratio, 0.2, 3);
    // Live DOM update; preserve the existing left/top so the slot stays
    // anchored at its current position during the resize.
    const c = currentShow.value.characters.find((x) => x.id === characterId);
    if (c) {
      slot.style.transform = `translate(-50%, -100%) scale(${lastScale})`;
    }
  });

  handle.addEventListener('pointerup', (ev) => {
    if (interaction?.kind !== 'resize' || interaction.characterId !== characterId) return;
    handle.releasePointerCapture(ev.pointerId);
    interaction = null;
    mutate((s) => ({
      ...s,
      characters: s.characters.map((c) =>
        c.id === characterId ? { ...c, scale: lastScale } : c,
      ),
    }));
  });
}

// ---- Preview (iframe with composition + controls) ----

let lastBuiltShowSig = '';

async function mountPreview(body: HTMLElement): Promise<void> {
  body.innerHTML = `
    <div class="h-full flex flex-col">
      <div class="flex-1 flex items-center justify-center p-6">
        <iframe
          id="preview-iframe"
          class="bg-neutral-900 rounded shadow-inner aspect-video w-full max-w-3xl"
          sandbox="allow-scripts allow-same-origin"
          title="composition preview"
        ></iframe>
      </div>
      <div class="border-t border-neutral-800 px-3 py-2 flex items-center gap-2 text-xs">
        <button id="play" class="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Play</button>
        <button id="pause" class="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Pause</button>
        <button id="restart" class="px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700">Restart</button>
        <span id="status" class="text-neutral-500 ml-2 truncate flex-1"></span>
        <button id="rebuild" class="px-2 py-1 rounded border border-neutral-700 hover:border-neutral-500">Rebuild</button>
        <button id="render" class="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white">Render MP4</button>
      </div>
    </div>
  `;

  const iframe = body.querySelector<HTMLIFrameElement>('#preview-iframe')!;
  const status = body.querySelector<HTMLElement>('#status')!;
  const player = () =>
    (iframe.contentWindow as unknown as { __player?: { play: () => void; pause: () => void; seek: (t: number) => void } } | null)?.__player ?? null;

  const show = currentShow.value;
  const sig = JSON.stringify(show);
  const needBuild = sig !== lastBuiltShowSig;

  status.textContent = needBuild ? 'building…' : 'loading…';
  if (needBuild) {
    try {
      const r = await window.api.buildComposition(show.id);
      lastBuiltShowSig = sig;
      if (r.missingLines.length > 0) {
        status.textContent = `built · ${r.missingLines.length} unrendered lines (Generate them in Dialogue)`;
      } else {
        status.textContent = `built · ${r.duration.toFixed(1)}s`;
      }
    } catch (e) {
      status.textContent = `build error: ${(e as Error).message}`;
      return;
    }
  }
  const url = (await window.api.previewUrl(show.id)).replace(
    /composition\.html$/,
    'index.html',
  );
  iframe.src = url;

  body.querySelector('#play')?.addEventListener('click', () => player()?.play());
  body.querySelector('#pause')?.addEventListener('click', () => player()?.pause());
  body.querySelector('#restart')?.addEventListener('click', () => {
    player()?.seek(0);
    player()?.play();
  });
  body.querySelector('#rebuild')?.addEventListener('click', () => {
    lastBuiltShowSig = '';
    void mountPreview(body);
  });

  body.querySelector('#render')?.addEventListener('click', async () => {
    status.textContent = 'preparing render…';
    const off = window.api.onRenderProgress((p) => {
      if (p.type === 'start') status.textContent = `rendering → ${p.outputPath}`;
      else if (p.type === 'log') status.textContent = p.line.slice(0, 200);
      else if (p.type === 'done') status.textContent = `done → ${p.outputPath}`;
      else if (p.type === 'error') status.textContent = `render failed: ${p.message}`;
    });
    try {
      // Force a rebuild before render so the on-disk index.html reflects current state.
      await window.api.buildComposition(currentShow.value.id);
      await window.api.renderShow(currentShow.value.id);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== 'cancelled') status.textContent = `render failed: ${msg}`;
    } finally {
      off();
    }
  });
}
