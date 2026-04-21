import { effect, signal } from '@preact/signals-core';
import Moveable from 'moveable';
import type { DefaultAsset } from '../../shared/ipc';
import { currentShow, mutate, selection } from '../state';
import { svgToDataUri, uid } from '../util';

const MIME = 'application/x-agentpark-asset';
type Tab = 'editor' | 'preview';
const tab = signal<Tab>('editor');

// The active stage element. Updating this signal triggers a re-render in the
// module-level editor effect. mountEditor sets it; mountPreview clears it.
const editorStage = signal<HTMLDivElement | null>(null);

// Persistent DOM: keyed by character id. Lets us keep slot elements stable
// across state changes so Moveable doesn't lose its target every time
// selection or position updates.
const slotMap = new Map<string, HTMLDivElement>();
let bgEl: HTMLImageElement | null = null;
let emptyEl: HTMLDivElement | null = null;

// One Moveable per stage lifetime; its target swaps as selection changes.
let moveable: Moveable | null = null;

// ---- Delete key shortcut (module-scope, one listener per app lifetime) ----
window.addEventListener('keydown', (ev) => {
  const t = ev.target as HTMLElement | null;
  // Don't hijack Delete/Backspace while typing in an input/textarea.
  if (
    t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.isContentEditable)
  ) {
    return;
  }
  if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
  const sel = selection.value;
  if (sel.type !== 'character' || !sel.id) return;
  ev.preventDefault();
  const id = sel.id;
  mutate((s) => ({
    ...s,
    characters: s.characters.filter((c) => c.id !== id),
    // Also drop dialogue lines that pointed at this speaker — otherwise
    // the TTS generator would keep trying to look up a character that
    // no longer exists.
    dialogue: s.dialogue.filter((l) => l.speakerId !== id),
  }));
  selection.value = { type: null, id: null };
});

// ---- Render effect ----
//
// Reads all signals up-front (signals-core re-tracks per run; an early return
// before reading a signal drops the subscription). Reconciles DOM rather than
// full-rebuilding so Moveable's target stays stable.
effect(() => {
  const stage = editorStage.value;
  const show = currentShow.value;
  const selected = selection.value;
  if (!stage) return;

  // --- Scene background (single element, update in place) ---
  if (show.scene) {
    if (emptyEl && emptyEl.parentNode === stage) emptyEl.remove();
    if (!bgEl) {
      bgEl = document.createElement('img');
      bgEl.className =
        'absolute inset-0 w-full h-full object-cover pointer-events-none';
      stage.prepend(bgEl);
    } else if (bgEl.parentNode !== stage) {
      stage.prepend(bgEl);
    }
    const desired = svgToDataUri(show.scene.svg);
    if (bgEl.src !== desired) bgEl.src = desired;
  } else {
    if (bgEl && bgEl.parentNode === stage) bgEl.remove();
    if (!emptyEl) {
      emptyEl = document.createElement('div');
      emptyEl.className =
        'absolute inset-0 flex items-center justify-center text-xs text-neutral-600 pointer-events-none';
      emptyEl.textContent = 'Drop or click a scene from the library';
    }
    if (emptyEl.parentNode !== stage) stage.appendChild(emptyEl);
  }

  // --- Reconcile slots ---
  const presentIds = new Set(show.characters.map((c) => c.id));
  for (const [id, slot] of slotMap) {
    if (!presentIds.has(id)) {
      slot.remove();
      slotMap.delete(id);
    }
  }

  for (const c of show.characters) {
    let slot = slotMap.get(c.id);
    if (!slot) {
      slot = createSlot(c.id);
      slotMap.set(c.id, slot);
      stage.appendChild(slot);
    } else if (slot.parentNode !== stage) {
      // Tab switched back — re-attach to the new stage.
      stage.appendChild(slot);
    }

    const img = slot.firstElementChild as HTMLImageElement;
    const desired = svgToDataUri(c.svg);
    if (img.src !== desired) img.src = desired;

    slot.style.left = `${c.x * 100}%`;
    slot.style.top = `${c.y * 100}%`;
    slot.style.transform = `translate(-50%, -100%) scale(${c.scale})`;
    slot.style.width = '20%';
    slot.style.zIndex = String(Math.round(c.y * 1000));
  }

  // --- Moveable (swap target on selection change) ---
  const selectedSlot =
    selected.type === 'character' && selected.id
      ? slotMap.get(selected.id) ?? null
      : null;

  if (!moveable) {
    moveable = createMoveable(stage);
  }
  if (moveable.target !== selectedSlot) {
    moveable.target = selectedSlot;
  }
  // Force a layout update so handles sit on the current transform.
  if (selectedSlot) moveable.updateRect();
});

function createSlot(characterId: string): HTMLDivElement {
  const slot = document.createElement('div');
  slot.className = 'absolute select-none';
  slot.style.position = 'absolute';
  slot.style.transformOrigin = 'bottom center';
  slot.style.touchAction = 'none';
  slot.style.cursor = 'pointer';
  slot.dataset.characterId = characterId;

  const img = document.createElement('img');
  img.className = 'w-full h-auto pointer-events-none';
  img.draggable = false;
  slot.appendChild(img);

  slot.addEventListener('pointerdown', (ev) => {
    // Click-to-select. The pointerdown also starts the Moveable drag when the
    // slot is already selected — Moveable attaches listeners to its own
    // overlay, not the slot, so there's no conflict.
    ev.stopPropagation();
    if (selection.value.id !== characterId) {
      selection.value = { type: 'character', id: characterId };
    }
  });

  return slot;
}

function createMoveable(stage: HTMLElement): Moveable {
  const m = new Moveable(stage, {
    target: null,
    draggable: true,
    resizable: true,
    keepRatio: true,
    origin: false,
    throttleDrag: 0,
    throttleResize: 0,
    renderDirections: ['nw', 'ne', 'sw', 'se'],
    edge: false,
    // The slot has a fixed base transform of translate(-50%, -100%) scale(s).
    // Tell Moveable to preserve that structure so its drag/resize deltas
    // compose with our anchor instead of clobbering it.
    preventClickEventOnDrag: true,
  });

  // Drag
  m.on('drag', ({ target, beforeTranslate }) => {
    applyInteractionTransform(target as HTMLElement, beforeTranslate, null);
  });
  m.on('dragEnd', ({ target, isDrag }) => {
    if (!isDrag) return;
    commitFromRect(target as HTMLElement, stage);
    // Reset inline drag translate — render effect will re-apply based on new state.
    clearInteractionTransform(target as HTMLElement);
  });

  // Resize (4 corners, keepRatio true → uniform scale)
  m.on('resize', ({ target, width, height, drag }) => {
    const el = target as HTMLElement;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    applyInteractionTransform(el, drag.beforeTranslate, null);
  });
  m.on('resizeEnd', ({ target, isDrag }) => {
    if (!isDrag) return;
    commitFromRect(target as HTMLElement, stage);
    const el = target as HTMLElement;
    el.style.height = '';
    el.style.width = '20%';
    clearInteractionTransform(el);
  });

  return m;
}

// Apply a Moveable delta on top of our base transform.
function applyInteractionTransform(
  el: HTMLElement,
  beforeTranslate: number[] | undefined,
  _unused: null,
): void {
  const id = el.dataset.characterId!;
  const c = currentShow.value.characters.find((x) => x.id === id);
  if (!c) return;
  const [dx, dy] = beforeTranslate ?? [0, 0];
  el.style.transform = `translate(-50%, -100%) scale(${c.scale}) translate(${dx}px, ${dy}px)`;
}

function clearInteractionTransform(el: HTMLElement): void {
  // Render effect will set the final transform based on new state.
  el.style.transform = '';
}

function commitFromRect(el: HTMLElement, stage: HTMLElement): void {
  const id = el.dataset.characterId;
  if (!id) return;
  const rect = el.getBoundingClientRect();
  const stageRect = stage.getBoundingClientRect();
  const bottomX = (rect.left + rect.width / 2 - stageRect.left) / stageRect.width;
  const bottomY = (rect.bottom - stageRect.top) / stageRect.height;
  const scale = rect.width / (stageRect.width * 0.2);
  mutate((s) => ({
    ...s,
    characters: s.characters.map((c) =>
      c.id === id
        ? {
            ...c,
            x: clamp01(bottomX),
            y: clamp01(bottomY),
            scale: clamp(scale, 0.2, 3),
            z: Math.round(clamp01(bottomY) * 1000),
          }
        : c,
    ),
  }));
}

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
        'click a character to select · drag to reposition · any corner to resize · Delete to remove';
      mountEditor(body);
    } else {
      hint.textContent = 'audio + lip sync runs from generated lines';
      void mountPreview(body);
    }
  });
}

// ---- Editor mount ----

function mountEditor(body: HTMLElement): void {
  body.innerHTML = `
    <div class="h-full flex items-center justify-center p-6">
      <div id="preview-stage" class="relative bg-neutral-900 rounded shadow-inner aspect-video w-full max-w-3xl overflow-hidden"></div>
    </div>
  `;
  const stage = body.querySelector<HTMLDivElement>('#preview-stage')!;

  // Moveable is tied to a specific container; if we tab-switched, the old one
  // is now on a detached stage and must be destroyed.
  if (moveable) {
    moveable.destroy();
    moveable = null;
  }
  // Also drop the persistent DOM map — their elements were children of the
  // old stage and are now orphaned.
  slotMap.clear();
  bgEl = null;
  emptyEl = null;

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
    const userAssets = await window.api.userAssetsList();
    const asset =
      defaults.find((a) => a.id === id) ?? userAssets.find((a) => a.id === id);
    if (!asset) return;
    const rect = stage.getBoundingClientRect();
    const x = clamp01((ev.clientX - rect.left) / rect.width);
    const y = clamp01((ev.clientY - rect.top) / rect.height);
    addAsset(asset, x, y);
  });

  // Clicking empty space deselects.
  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target === stage || (ev.target as HTMLElement).tagName === 'IMG') {
      if (
        (ev.target as HTMLElement).classList.contains('scene-bg') ||
        ev.target === stage
      ) {
        selection.value = { type: null, id: null };
      }
    }
  });

  editorStage.value = stage;
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

// ---- Preview (iframe with composition + controls) ----

let lastBuiltShowSig = '';

async function mountPreview(body: HTMLElement): Promise<void> {
  editorStage.value = null;
  if (moveable) {
    moveable.destroy();
    moveable = null;
  }
  slotMap.clear();
  bgEl = null;
  emptyEl = null;

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
    (
      iframe.contentWindow as unknown as {
        __player?: {
          play: () => void;
          pause: () => void;
          seek: (t: number) => void;
        };
      } | null
    )?.__player ?? null;

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
  const url = await window.api.previewUrl(show.id);
  iframe.src = url;

  body
    .querySelector('#play')
    ?.addEventListener('click', () => player()?.play());
  body
    .querySelector('#pause')
    ?.addEventListener('click', () => player()?.pause());
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
      else if (p.type === 'error')
        status.textContent = `render failed: ${p.message}`;
    });
    try {
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
