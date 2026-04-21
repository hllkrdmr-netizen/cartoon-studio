import './index.css';
import { openSettings } from './settings';
import { mountLibrary, loadDefaults } from './panes/library';
import { mountCenter } from './panes/center';
import { mountInspector } from './panes/inspector';
import { mountDialogue } from './panes/dialogue';
import { currentShow } from './state';
import { effect } from '@preact/signals-core';

const root = document.getElementById('app');
if (!root) {
  throw new Error('#app root element missing from index.html');
}

root.innerHTML = `
  <main class="flex h-screen flex-col bg-neutral-950 text-neutral-100">
    <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
      <div class="flex items-baseline gap-3">
        <h1 class="text-sm font-semibold tracking-wide">Agent Park</h1>
        <span id="show-name" class="text-xs text-neutral-400"></span>
      </div>
      <button id="open-settings" class="rounded border border-neutral-700 hover:border-neutral-500 px-3 py-1 text-xs">
        Settings
      </button>
    </header>
    <div class="flex-1 grid grid-cols-[260px_1fr_340px] overflow-hidden">
      <aside id="left-pane" class="border-r border-neutral-800 bg-neutral-900/40 overflow-hidden"></aside>
      <section id="center-pane" class="overflow-hidden"></section>
      <aside id="right-pane" class="border-l border-neutral-800 bg-neutral-900/40 overflow-hidden flex flex-col">
        <div id="inspector" class="border-b border-neutral-800 max-h-[40%] overflow-hidden"></div>
        <div id="dialogue" class="flex-1 overflow-hidden"></div>
      </aside>
    </div>
  </main>
`;

document
  .getElementById('open-settings')
  ?.addEventListener('click', openSettings);

effect(() => {
  const el = document.getElementById('show-name');
  if (el) el.textContent = `· ${currentShow.value.name}`;
});

mountLibrary(document.getElementById('left-pane')!);
mountCenter(document.getElementById('center-pane')!);
mountInspector(document.getElementById('inspector')!);
mountDialogue(document.getElementById('dialogue')!);

void loadDefaults();
