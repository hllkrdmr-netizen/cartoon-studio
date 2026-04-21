import { effect } from '@preact/signals-core';
import { currentShow, selection } from '../state';

export function mountInspector(root: HTMLElement): void {
  effect(() => {
    const show = currentShow.value;
    const sel = selection.value;

    let body = '';
    if (sel.type === 'character' && sel.id) {
      const c = show.characters.find((x) => x.id === sel.id);
      body = c
        ? `
          <h3 class="text-sm font-semibold mb-2">${c.name}</h3>
          <p class="text-xs text-neutral-400">Drag in the canvas to reposition. Resize handles arrive in Phase 6.</p>
          <dl class="mt-3 grid grid-cols-2 gap-1 text-xs text-neutral-300">
            <dt class="text-neutral-500">x</dt><dd>${c.x.toFixed(2)}</dd>
            <dt class="text-neutral-500">y</dt><dd>${c.y.toFixed(2)}</dd>
            <dt class="text-neutral-500">scale</dt><dd>${c.scale.toFixed(2)}</dd>
            <dt class="text-neutral-500">z</dt><dd>${c.z}</dd>
          </dl>`
        : '<p class="text-xs text-neutral-500">Character not found.</p>';
    } else if (sel.type === 'scene') {
      body = `<h3 class="text-sm font-semibold mb-2">${show.scene?.name ?? 'No scene'}</h3>`;
    } else {
      body = `
        <h3 class="text-sm font-semibold mb-2">${show.name}</h3>
        <p class="text-xs text-neutral-400 mb-3">Click a character or line to inspect it.</p>
        <ul class="text-xs text-neutral-400 space-y-1">
          <li>Scene: <span class="text-neutral-200">${show.scene?.name ?? '—'}</span></li>
          <li>Characters: <span class="text-neutral-200">${show.characters.length}</span></li>
          <li>Lines: <span class="text-neutral-200">${show.dialogue.length}</span></li>
        </ul>
      `;
    }

    root.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="p-3 border-b border-neutral-800">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Inspector</h2>
        </div>
        <div class="flex-1 overflow-y-auto p-3 text-neutral-200">${body}</div>
      </div>
    `;
  });
}
