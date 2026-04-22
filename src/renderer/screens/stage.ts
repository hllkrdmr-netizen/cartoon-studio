import { effect, signal } from '@preact/signals-core';
import Moveable from 'moveable';
import type { DefaultAsset } from '../../shared/ipc';
import {
  defaults,
  userAssets,
  pendingAssets,
  isUserAsset,
  uploadAsset,
  generateAsset,
  deleteUserAsset,
} from '../library';
import { currentScreen, currentShow, mutate, selection } from '../state';
import { svgToDataUri, uid } from '../util';
import { VOICES, defaultVoice, findVoice } from '../../shared/voices';

// Seed voices for the four bundled default characters. Keyed by the asset
// id that resources.ts generates from the SVG filename. All four are on
// Google Gemini so a user with a single GOOGLE_API_KEY can play the full
// demo cast without juggling providers — male voices for Bill/Ted/Max
// (Max is the dog, gravelly fits), female for Jane.
const SEED_VOICE_BY_ASSET_ID: Record<
  string,
  { model: string; voice: string }
> = {
  'character:bill': { model: 'google/gemini-2.5-flash-preview-tts', voice: 'Charon' },
  'character:ted':  { model: 'google/gemini-2.5-flash-preview-tts', voice: 'Fenrir' },
  'character:jane': { model: 'google/gemini-2.5-flash-preview-tts', voice: 'Leda' },
  'character:max':  { model: 'google/gemini-2.5-flash-preview-tts', voice: 'Algenib' },
};

// The Stage screen — single "set up the show" screen that combines the
// library browser (top strip — characters AND scenes both visible) with
// the arrangement canvas below. Dialogue and Play live on their own
// screens.

const editorStage = signal<HTMLDivElement | null>(null);

const slotMap = new Map<string, HTMLDivElement>();
let bgEl: HTMLImageElement | null = null;
let emptyStageEl: HTMLDivElement | null = null;
let moveable: Moveable | null = null;

// Delete/Backspace to remove the selected character. state.ts clears the
// selection when the user leaves Stage so the handler stays dormant on
// Dialogue/Play.
window.addEventListener('keydown', (ev) => {
  const t = ev.target as HTMLElement | null;
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
  removeCharacter(sel.id);
});

effect(() => {
  const stage = editorStage.value;
  const show = currentShow.value;
  const selected = selection.value;
  if (!stage) return;

  // Scene background.
  if (show.scene) {
    if (emptyStageEl && emptyStageEl.parentNode === stage) emptyStageEl.remove();
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
    if (!emptyStageEl) {
      emptyStageEl = document.createElement('div');
      emptyStageEl.className =
        'absolute inset-0 flex items-center justify-center text-xs text-neutral-500 pointer-events-none text-center px-6';
      emptyStageEl.textContent = 'Pick a scene from the Scenes tab above.';
    }
    if (emptyStageEl.parentNode !== stage) stage.appendChild(emptyStageEl);
  }

  // Slots for each character.
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
      stage.appendChild(slot);
    }
    const img = slot.firstElementChild as HTMLImageElement;
    const desired = svgToDataUri(c.svg);
    if (img.src !== desired) img.src = desired;

    slot.style.left = `${c.x * 100}%`;
    slot.style.top = `${c.y * 100}%`;
    slot.style.transform = `translate(-50%, -100%) scale(${c.scale})`;
    slot.style.width = '20%';
    // Keep slot z-indexes inside a small range so they can't stack above
    // the header/library-strip/footer (which are set to z-20 relative).
    // Original used `c.y * 1000` for painter's-algorithm depth sorting —
    // now we map y ∈ [0, 1] to z ∈ [1, 10] instead.
    slot.style.zIndex = String(1 + Math.round(c.y * 9));
  }

  // Moveable target follows the current selection.
  const selectedSlot =
    selected.type === 'character' && selected.id
      ? slotMap.get(selected.id) ?? null
      : null;
  if (!moveable) moveable = createMoveable(stage);
  if (moveable.target !== selectedSlot) moveable.target = selectedSlot;
  if (selectedSlot) moveable.updateRect();
});

function createSlot(characterId: string): HTMLDivElement {
  const slot = document.createElement('div');
  slot.className = 'absolute select-none';
  slot.style.position = 'absolute';
  slot.style.transformOrigin = 'bottom center';
  slot.style.touchAction = 'none';
  slot.style.cursor = 'grab';
  slot.dataset.characterId = characterId;

  const img = document.createElement('img');
  img.className = 'w-full h-auto pointer-events-none';
  img.draggable = false;
  slot.appendChild(img);

  slot.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    if (selection.value.id !== characterId) {
      selection.value = { type: 'character', id: characterId };
    }
    const stage = editorStage.value;
    if (!stage) return;
    const c = currentShow.value.characters.find((x) => x.id === characterId);
    if (!c) return;

    const stageRect0 = stage.getBoundingClientRect();
    const grabDx = c.x * stageRect0.width - (ev.clientX - stageRect0.left);
    const grabDy = c.y * stageRect0.height - (ev.clientY - stageRect0.top);

    let lastX = c.x;
    let lastY = c.y;
    let moved = false;
    slot.setPointerCapture(ev.pointerId);
    slot.style.cursor = 'grabbing';

    const onMove = (e: PointerEvent) => {
      const r = stage.getBoundingClientRect();
      const ax = e.clientX - r.left + grabDx;
      const ay = e.clientY - r.top + grabDy;
      lastX = clamp01(ax / r.width);
      lastY = clamp01(ay / r.height);
      slot.style.left = `${lastX * 100}%`;
      slot.style.top = `${lastY * 100}%`;
      moved = true;
      moveable?.updateRect();
    };
    const onUp = () => {
      slot.removeEventListener('pointermove', onMove);
      slot.removeEventListener('pointerup', onUp);
      slot.removeEventListener('pointercancel', onUp);
      try {
        slot.releasePointerCapture(ev.pointerId);
      } catch {
        /* already released */
      }
      slot.style.cursor = 'grab';
      if (!moved) return;
      mutate((s) => ({
        ...s,
        characters: s.characters.map((ch) =>
          ch.id === characterId
            ? { ...ch, x: lastX, y: lastY, z: Math.round(lastY * 1000) }
            : ch,
        ),
      }));
    };
    slot.addEventListener('pointermove', onMove);
    slot.addEventListener('pointerup', onUp);
    slot.addEventListener('pointercancel', onUp);
  });

  return slot;
}

function createMoveable(stage: HTMLElement): Moveable {
  const m = new Moveable(stage, {
    target: null,
    draggable: false,
    resizable: true,
    keepRatio: true,
    origin: false,
    throttleResize: 0,
    renderDirections: ['nw', 'ne', 'sw', 'se'],
    edge: false,
  });

  m.on('resize', ({ target, width, height, drag }) => {
    const el = target as HTMLElement;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    const [dx, dy] = drag.beforeTranslate ?? [0, 0];
    const id = el.dataset.characterId!;
    const c = currentShow.value.characters.find((x) => x.id === id);
    if (!c) return;
    el.style.transform = `translate(${dx}px, ${dy}px) translate(-50%, -100%)`;
  });
  m.on('resizeEnd', ({ target, isDrag }) => {
    if (!isDrag) return;
    commitFromRect(target as HTMLElement, stage);
    (target as HTMLElement).style.height = '';
  });

  return m;
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

function removeCharacter(id: string): void {
  mutate((s) => ({
    ...s,
    characters: s.characters.filter((c) => c.id !== id),
    dialogue: s.dialogue.filter((l) => l.speakerId !== id),
  }));
  selection.value = { type: null, id: null };
}

export function mountStage(root: HTMLElement): void {
  root.innerHTML = `
    <div class="flex h-full" style="background: var(--color-ink);">

      <!-- LIBRARY SIDEBAR — both Characters and Scenes always visible,
           each its own scrollable section with Upload + Generate buttons.
           Familiar from Figma / Sketch / Procreate. -->
      <aside class="shrink-0 flex flex-col"
             style="width: 288px; border-right: 1px solid var(--color-hairline); background: var(--color-surface);">
        <header class="shrink-0" style="padding: 16px 18px 12px;">
          <div class="caption">SC.01 · LIBRARY</div>
          <div class="font-display mt-1.5" style="font-size: 19px; font-weight: 500; letter-spacing: -0.01em; line-height: 1.05;">
            <span style="color: var(--color-text);">The </span><em style="color: var(--color-accent);">cast</em><span style="color: var(--color-text);"> &amp; </span><em style="color: var(--color-accent);">set</em><span style="color: var(--color-text);">.</span>
          </div>
        </header>

        <div class="flex-1 overflow-y-auto" style="padding: 0 18px 18px;">
          <!-- SCENES -->
          <section data-lib-section="scene" style="padding-top: 14px;">
            <div class="flex items-center justify-between gap-2 mb-3">
              <span class="caption">SCENES</span>
              <div class="flex items-center gap-1.5">
                <button data-action="upload-scene" class="lib-mini-btn" title="Upload SVG">↑</button>
                <button data-action="generate-scene" class="lib-mini-btn lib-mini-btn-accent" title="Generate with AI">+</button>
              </div>
            </div>
            <div class="rule mb-3"></div>
            <div data-lib-grid="scene" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;"></div>
          </section>

          <!-- CHARACTERS -->
          <section data-lib-section="character" style="padding-top: 24px;">
            <div class="flex items-center justify-between gap-2 mb-3">
              <span class="caption">CHARACTERS</span>
              <div class="flex items-center gap-1.5">
                <button data-action="upload-character" class="lib-mini-btn" title="Upload SVG">↑</button>
                <button data-action="generate-character" class="lib-mini-btn lib-mini-btn-accent" title="Generate with AI">+</button>
              </div>
            </div>
            <div class="rule mb-3"></div>
            <div data-lib-grid="character" style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;"></div>
          </section>
        </div>
      </aside>

      <!-- MAIN: header strip + canvas + selection bar + footer.
           The canvas now gets the full window height minus only chrome. -->
      <div class="flex flex-col flex-1 min-w-0">
        <header class="relative shrink-0 flex items-center gap-4 px-6"
                style="height: 44px; border-bottom: 1px solid var(--color-hairline);">
          <span class="caption">SC.01 · STAGE</span>
          <span class="rule" style="width: 20px;"></span>
          <span class="caption" style="color: var(--color-quiet); letter-spacing: 0.06em;">DRAG · RESIZE · DELETE</span>
        </header>

        <div id="selection-bar" class="relative shrink-0 hidden items-center justify-between gap-3"
             style="padding: 8px 24px; border-bottom: 1px solid var(--color-hairline); background: var(--color-surface);"></div>

        <div id="stage-wrap" class="relative flex-1 flex items-center justify-center min-h-0 overflow-hidden vignette"
             style="padding: 28px;">
          <div id="preview-stage" class="isolate relative aspect-video w-full h-auto max-w-full max-h-full overflow-hidden"
               style="background: #0a0b0c; box-shadow: 0 0 0 1px var(--color-hairline-strong), 0 24px 56px -28px rgba(0,0,0,0.85);"></div>
        </div>

        <footer class="relative shrink-0 flex items-center justify-between gap-4 px-6"
                style="height: 52px; border-top: 1px solid var(--color-hairline); background: var(--color-ink);">
          <span id="cast-summary" class="caption"></span>
          <button data-goto="play" class="btn-primary">Continue · Play →</button>
        </footer>
      </div>

    </div>
  `;

  root
    .querySelector<HTMLButtonElement>('[data-goto="play"]')!
    .addEventListener('click', () => {
      currentScreen.value = 'play';
    });

  root
    .querySelector<HTMLButtonElement>('[data-action="upload-character"]')!
    .addEventListener('click', () => uploadAsset('character'));
  root
    .querySelector<HTMLButtonElement>('[data-action="generate-character"]')!
    .addEventListener('click', () => generateAsset('character'));
  root
    .querySelector<HTMLButtonElement>('[data-action="upload-scene"]')!
    .addEventListener('click', () => uploadAsset('scene'));
  root
    .querySelector<HTMLButtonElement>('[data-action="generate-scene"]')!
    .addEventListener('click', () => generateAsset('scene'));

  const stage = root.querySelector<HTMLDivElement>('#preview-stage')!;
  const selectionBar = root.querySelector<HTMLDivElement>('#selection-bar')!;
  const charGrid = root.querySelector<HTMLDivElement>('[data-lib-grid="character"]')!;
  const sceneGrid = root.querySelector<HTMLDivElement>('[data-lib-grid="scene"]')!;
  const castSummary = root.querySelector<HTMLSpanElement>('#cast-summary')!;

  stage.addEventListener('pointerdown', (ev) => {
    if (ev.target === stage || ev.target === bgEl) {
      selection.value = { type: null, id: null };
    }
  });

  editorStage.value = stage;

  // Characters grid — 2-up, always visible.
  effect(() => {
    const items = [...defaults.value, ...userAssets.value].filter(
      (a) => a.type === 'character',
    );
    const pending = pendingAssets.value.filter((p) => p.type === 'character');
    charGrid.innerHTML = '';
    if (items.length === 0 && pending.length === 0) {
      const empty = emptyHint('NO CHARACTERS YET');
      empty.style.gridColumn = '1 / -1';
      charGrid.appendChild(empty);
      return;
    }
    for (const a of items) charGrid.appendChild(renderLibraryTile(a, false));
    for (const p of pending) charGrid.appendChild(renderPendingTile(p.name, true));
  });

  // Scenes grid — 2-up. Selected scene gets the orange ring.
  effect(() => {
    const selectedSceneId = currentShow.value.scene?.id ?? null;
    const items = [...defaults.value, ...userAssets.value].filter(
      (a) => a.type === 'scene',
    );
    const pending = pendingAssets.value.filter((p) => p.type === 'scene');
    sceneGrid.innerHTML = '';
    if (items.length === 0 && pending.length === 0) {
      const empty = emptyHint('NO SCENES YET');
      empty.style.gridColumn = '1 / -1';
      sceneGrid.appendChild(empty);
      return;
    }
    for (const a of items) {
      const isSelected = a.id === selectedSceneId;
      sceneGrid.appendChild(renderLibraryTile(a, isSelected));
    }
    for (const p of pending) sceneGrid.appendChild(renderPendingTile(p.name, false));
  });

  // Footer summary — quick at-a-glance count of show contents.
  effect(() => {
    const show = currentShow.value;
    const charCount = show.characters.length;
    const sceneName = show.scene?.name ?? 'NO SCENE';
    castSummary.textContent = `${charCount} CHAR${charCount === 1 ? '' : 'S'} · ${sceneName.toUpperCase()}`;
  });

  // Selection bar under the library strip. Voice picking lives on the
  // Dialogue tab (cast-voices strip) — keeping a second picker here just
  // duplicated state without adding clarity.
  effect(() => {
    const sel = selection.value;
    const show = currentShow.value;
    const c =
      sel.type === 'character' && sel.id
        ? show.characters.find((x) => x.id === sel.id)
        : null;
    if (!c) {
      selectionBar.style.display = 'none';
      selectionBar.innerHTML = '';
      return;
    }
    selectionBar.style.display = 'flex';
    selectionBar.innerHTML = `
      <div class="flex items-center gap-4 min-w-0">
        <span class="caption caption-accent">SELECTED</span>
        <span class="font-display italic truncate" style="font-size: 17px; font-weight: 500; color: var(--color-text);">${escapeHtml(c.name)}</span>
        <span class="caption" style="font-size: 10px;">X ${c.x.toFixed(2)} · Y ${c.y.toFixed(2)} · ×${c.scale.toFixed(2)}</span>
      </div>
      <button data-del class="btn-ghost" style="border-color: var(--color-danger); color: var(--color-danger);">
        Delete
      </button>
    `;
    selectionBar
      .querySelector<HTMLButtonElement>('[data-del]')!
      .addEventListener('click', () => removeCharacter(c.id));
  });
}

function emptyHint(text: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'caption';
  p.style.padding = '14px 6px';
  p.textContent = text;
  return p;
}

// Skeleton tile shown in the library grid while a Recraft generation is
// in flight. Same dimensions as a real tile so the grid doesn't reflow
// when the result lands.
function renderPendingTile(name: string, isCharacter: boolean): HTMLDivElement {
  const tile = document.createElement('div');
  const aspectClass = isCharacter ? 'aspect-square w-full' : 'aspect-video w-full';
  tile.className = 'relative flex flex-col gap-1.5 min-w-0';
  tile.innerHTML = `
    <div class="${aspectClass} relative overflow-hidden flex flex-col items-center justify-center gap-2 ap-pending-tile"
         style="background: #0a0b0c; box-shadow: inset 0 0 0 1px var(--color-hairline);">
      <div class="ap-spinner"></div>
      <span class="caption" style="font-size: 9px; color: var(--color-quiet);">GENERATING</span>
    </div>
    <span class="truncate" style="font-family: var(--font-display); font-style: italic; font-weight: 400; font-size: 12.5px; color: var(--color-quiet); line-height: 1.2; padding: 0 1px;">${escapeHtml(name)}</span>
  `;
  return tile;
}

function renderLibraryTile(
  asset: DefaultAsset,
  isSelected: boolean,
): HTMLDivElement {
  const tile = document.createElement('div');
  const isCharacter = asset.type === 'character';
  // No fixed width — tiles stretch to fill the parent grid column. The
  // image inside drives height via aspect-ratio.
  const aspectClass = isCharacter ? 'aspect-square w-full' : 'aspect-video w-full';
  tile.className = 'group relative cursor-pointer flex flex-col gap-1.5 min-w-0';
  tile.style.transition = 'transform 160ms var(--ease-snap)';
  const ring = isSelected
    ? 'inset 0 0 0 1.5px var(--color-accent), 0 0 0 1px var(--color-hairline)'
    : 'inset 0 0 0 1px var(--color-hairline)';
  tile.innerHTML = `
    <div class="${aspectClass} relative overflow-hidden flex items-center justify-center"
         style="background: #0a0b0c; box-shadow: ${ring};">
      <img src="${svgToDataUri(asset.svg)}" class="w-full h-full ${isCharacter ? 'object-contain' : 'object-cover'}" alt="${escapeHtml(asset.name)}" draggable="false" />
      ${
        isUserAsset(asset)
          ? `<button data-delete-asset class="absolute top-1 right-1 hidden group-hover:flex items-center justify-center" style="width: 18px; height: 18px; background: rgba(14,15,16,0.9); color: var(--color-quiet); font-size: 12px; line-height: 1;" title="Delete from library">×</button>`
          : ''
      }
      ${
        isSelected
          ? `<span class="caption caption-accent absolute" style="bottom: 4px; left: 5px; font-size: 8.5px; background: var(--color-ink); padding: 2px 4px;">◆ IN USE</span>`
          : ''
      }
    </div>
    <span class="truncate" style="font-family: var(--font-display); font-style: italic; font-weight: 400; font-size: 12.5px; color: var(--color-quiet); line-height: 1.2; padding: 0 1px;">${escapeHtml(asset.name)}</span>
  `;
  tile.addEventListener('mouseenter', () => {
    if (!isSelected) {
      const wrap = tile.firstElementChild as HTMLDivElement;
      wrap.style.boxShadow =
        'inset 0 0 0 1px var(--color-hairline-strong), 0 0 0 0 transparent';
    }
  });
  tile.addEventListener('mouseleave', () => {
    if (!isSelected) {
      const wrap = tile.firstElementChild as HTMLDivElement;
      wrap.style.boxShadow = 'inset 0 0 0 1px var(--color-hairline)';
    }
  });
  tile.addEventListener('click', (ev) => {
    if ((ev.target as HTMLElement).closest('[data-delete-asset]')) return;
    if (asset.type === 'character') {
      addCharacterToShow(asset);
    } else if (isSelected) {
      mutate((s) => ({ ...s, scene: null }));
    } else {
      mutate((s) => ({
        ...s,
        scene: { id: asset.id, name: asset.name, svg: asset.svg },
      }));
    }
  });
  tile
    .querySelector<HTMLButtonElement>('[data-delete-asset]')
    ?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      void deleteUserAsset(asset.id, asset.name);
    });
  return tile;
}

function addCharacterToShow(asset: DefaultAsset): void {
  const existing = currentShow.value.characters.length;
  // Seeded defaults (Bill/Ted/Jane/Max) get a hand-picked Gemini voice with
  // the right gender. Anything else (user-uploaded/generated) falls back
  // to round-robin across the full catalog so a fresh cast still gets
  // distinct voices out of the box.
  const seed = SEED_VOICE_BY_ASSET_ID[asset.id];
  const v =
    (seed ? findVoice(seed.model, seed.voice) : null) ??
    VOICES[existing % VOICES.length] ??
    defaultVoice();
  mutate((s) => ({
    ...s,
    characters: [
      ...s.characters,
      {
        id: uid('char'),
        name: asset.name,
        svg: asset.svg,
        x: 0.25 + (existing % 3) * 0.25,
        y: 0.7,
        scale: 1,
        z: existing,
        provider: v.provider,
        model: v.model,
        voice: v.voice,
      },
    ],
  }));
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
