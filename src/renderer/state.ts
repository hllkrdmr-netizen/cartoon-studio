import { signal, batch, effect } from '@preact/signals-core';
import { emptyShow, type Show } from '../shared/show';

export type Screen = 'stage' | 'dialogue' | 'play';
export const currentScreen = signal<Screen>('stage');

export const currentShow = signal<Show>(emptyShow());
export const selection = signal<{
  type: 'character' | 'line' | 'scene' | null;
  id: string | null;
}>({ type: null, id: null });

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
