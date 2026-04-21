import { signal, batch, effect } from '@preact/signals-core';
import { emptyShow, type Show } from '../shared/show';

export const currentShow = signal<Show>(emptyShow());
export const selection = signal<{
  type: 'character' | 'line' | 'scene' | null;
  id: string | null;
}>({ type: null, id: null });

let saveTimer: number | undefined;
const SAVE_DEBOUNCE_MS = 500;

export function mutate(updater: (s: Show) => Show): void {
  batch(() => {
    currentShow.value = updater(currentShow.value);
  });
}

export function loadShow(show: Show): void {
  selection.value = { type: null, id: null };
  currentShow.value = show;
}

// Auto-save: every change triggers a debounced save IPC.
effect(() => {
  // subscribe to currentShow changes
  const show = currentShow.value;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void window.api.showSave(show);
  }, SAVE_DEBOUNCE_MS);
});
