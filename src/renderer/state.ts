import { signal, batch, effect } from '@preact/signals-core';
import { emptyShow, type Show, type ShowSummary } from '../shared/show';

export type Screen = 'stage' | 'dialogue' | 'play';
export const currentScreen = signal<Screen>('stage');

// currentShow is always non-null so the three screens can read .scene /
// .characters / .dialogue without nullchecks. The boot logic below seeds
// a placeholder synchronously, then swaps to the real loaded show. Auto-
// save is gated on `isBooted` so the placeholder never hits disk.
export const currentShow = signal<Show>(emptyShow('Loading…'));
export const allShows = signal<ShowSummary[]>([]);

export const selection = signal<{
  type: 'character' | 'line' | 'scene' | null;
  id: string | null;
}>({ type: null, id: null });

const isBooted = signal(false);

const LAST_SHOW_KEY = 'cartoonstudio.lastShowId';

// Selecting a character only makes sense on the Stage screen — the Delete-key
// shortcut and Moveable resize handles are stage-scoped. Drop the selection
// when leaving Stage so a stray Backspace on (say) Dialogue can't delete a
// character that the user can't see.
effect(() => {
  if (currentScreen.value !== 'stage' && selection.value.type === 'character') {
    selection.value = { type: null, id: null };
  }
});

let saveTimer: number | undefined;
const SAVE_DEBOUNCE_MS = 500;

export function mutate(updater: (s: Show) => Show): void {
  batch(() => {
    currentShow.value = updater(currentShow.value);
  });
}

// Swap to a show that already exists on disk. Persists the id so the
// next launch reopens the same show.
export function loadShow(show: Show): void {
  selection.value = { type: null, id: null };
  currentShow.value = show;
  try {
    localStorage.setItem(LAST_SHOW_KEY, show.id);
  } catch {
    /* localStorage disabled — non-fatal, just won't restore on next launch */
  }
}

// Auto-save: every change to currentShow triggers a debounced save IPC.
// Gated on isBooted so the placeholder show during boot doesn't write a
// phantom "Loading…" file to disk.
effect(() => {
  const show = currentShow.value;
  if (!isBooted.value) return;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void window.api
      .showSave(show)
      .then(() => void refreshShowList())
      .catch(() => {
        /* save failed — toast surfaced elsewhere if we wire one up later */
      });
  }, SAVE_DEBOUNCE_MS);
});

export async function refreshShowList(): Promise<void> {
  try {
    allShows.value = await window.api.showList();
  } catch {
    /* leave the existing list in place on transient failure */
  }
}

// Boot the multi-show system: refresh the list, restore the last-opened
// show (or the most recently updated one, or freshly create one if the
// user has none yet), then unblock auto-save. Idempotent — calling twice
// is a no-op after the first successful boot.
export async function bootShows(): Promise<void> {
  if (isBooted.value) return;
  await refreshShowList();

  const lastId = (() => {
    try {
      return localStorage.getItem(LAST_SHOW_KEY);
    } catch {
      return null;
    }
  })();

  let show: Show | null = null;
  if (lastId && allShows.value.some((s) => s.id === lastId)) {
    show = await window.api.showLoad(lastId).catch(() => null);
  }
  if (!show && allShows.value.length > 0) {
    show = await window.api.showLoad(allShows.value[0].id).catch(() => null);
  }
  if (!show) {
    show = emptyShow('Untitled show');
    await window.api.showSave(show);
    await refreshShowList();
  }

  // Set state under the boot gate, then flip the gate. Order matters:
  // flipping isBooted before setting currentShow would let the auto-save
  // effect fire once with the placeholder.
  selection.value = { type: null, id: null };
  currentShow.value = show;
  try {
    localStorage.setItem(LAST_SHOW_KEY, show.id);
  } catch {
    /* ignore */
  }
  isBooted.value = true;
}

// CRUD helpers used by the show picker. Each mutates allShows after the
// IPC roundtrip so the picker re-renders without an extra fetch.

export async function createShow(name: string): Promise<Show> {
  const fresh = emptyShow(name.trim() || 'Untitled show');
  await window.api.showSave(fresh);
  await refreshShowList();
  loadShow(fresh);
  return fresh;
}

export function renameCurrentShow(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  mutate((s) => ({ ...s, name: trimmed }));
  // refreshShowList is fired by the auto-save effect once it persists.
}

export async function deleteShow(id: string): Promise<void> {
  await window.api.showDelete(id);
  await refreshShowList();
  if (currentShow.value.id !== id) return;
  // We just deleted the open show — pick the next available, or create
  // a fresh "Untitled show" if the user deleted their only one.
  if (allShows.value.length > 0) {
    const next = await window.api.showLoad(allShows.value[0].id);
    loadShow(next);
  } else {
    const fresh = emptyShow('Untitled show');
    await window.api.showSave(fresh);
    await refreshShowList();
    loadShow(fresh);
  }
}
