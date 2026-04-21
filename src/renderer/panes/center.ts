import { effect } from '@preact/signals-core';
import { currentShow } from '../state';
import { svgToDataUri } from '../util';

export function mountCenter(root: HTMLElement): void {
  root.innerHTML = `
    <div class="flex flex-col h-full">
      <div class="p-3 border-b border-neutral-800 flex items-center justify-between">
        <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Preview</h2>
      </div>
      <div class="flex-1 flex items-center justify-center bg-neutral-950 p-6">
        <div id="preview-stage" class="relative bg-neutral-900 rounded shadow-inner aspect-video w-full max-w-3xl overflow-hidden"></div>
      </div>
    </div>
  `;

  const stage = root.querySelector<HTMLDivElement>('#preview-stage')!;

  effect(() => {
    const show = currentShow.value;
    stage.innerHTML = '';

    if (show.scene) {
      const bg = document.createElement('img');
      bg.src = svgToDataUri(show.scene.svg);
      bg.className = 'absolute inset-0 w-full h-full object-cover';
      stage.appendChild(bg);
    } else {
      const empty = document.createElement('div');
      empty.className =
        'absolute inset-0 flex items-center justify-center text-xs text-neutral-600';
      empty.textContent = 'Pick a scene from the library';
      stage.appendChild(empty);
    }

    const sorted = [...show.characters].sort((a, b) => a.y - b.y);
    for (const c of sorted) {
      const slot = document.createElement('div');
      slot.className = 'absolute select-none';
      slot.style.left = `${c.x * 100}%`;
      slot.style.top = `${c.y * 100}%`;
      slot.style.transform = `translate(-50%, -100%) scale(${c.scale})`;
      slot.style.transformOrigin = 'bottom center';
      slot.style.width = '20%';
      slot.dataset.characterId = c.id;
      const img = document.createElement('img');
      img.src = svgToDataUri(c.svg);
      img.className = 'w-full h-auto pointer-events-none';
      slot.appendChild(img);
      stage.appendChild(slot);
    }
  });
}
