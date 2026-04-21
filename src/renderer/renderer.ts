import './index.css';
import { openSettings } from './settings';

const root = document.getElementById('app');
if (!root) {
  throw new Error('#app root element missing from index.html');
}

root.innerHTML = `
  <main class="flex h-screen flex-col bg-neutral-950 text-neutral-100">
    <header class="flex items-center justify-between border-b border-neutral-800 px-4 py-2">
      <h1 class="text-sm font-semibold tracking-wide">Agent Park</h1>
      <button id="open-settings" class="rounded border border-neutral-700 hover:border-neutral-500 px-3 py-1 text-sm">
        Settings
      </button>
    </header>
    <div class="flex-1 flex items-center justify-center text-neutral-500 text-sm">
      Editor scaffolding — pick a show or open Settings to configure API keys.
    </div>
  </main>
`;

document
  .getElementById('open-settings')
  ?.addEventListener('click', openSettings);
