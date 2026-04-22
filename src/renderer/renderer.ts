import './index.css';
import { effect } from '@preact/signals-core';
import { openSettings } from './settings';
import { loadDefaults } from './library';
import { registerOpenSettings } from './notify';
import { setupUpdateBanner } from './updater';
import { currentScreen, currentShow, type Screen } from './state';
import { mountDialogue } from './screens/dialogue';
import { mountStage } from './screens/stage';
import { mountPlay } from './screens/play';

// Wire the toast system to the settings panel so missing-key errors can
// surface a one-click "Open Settings" action.
registerOpenSettings(openSettings);

const root = document.getElementById('app');
if (!root) {
  throw new Error('#app root element missing from index.html');
}

// Scene numbers used for the clapboard slate flash on screen transition —
// Stage is SC.01 because it's where you build the scene, then 02 dialogue,
// then 03 play. Reads as a film production order.
const SCREENS: Array<{ id: Screen; label: string; slate: string }> = [
  { id: 'stage', label: 'Stage', slate: 'SC.01' },
  { id: 'dialogue', label: 'Dialogue', slate: 'SC.02' },
  { id: 'play', label: 'Play', slate: 'SC.03' },
];

root.innerHTML = `
  <main class="flex h-screen flex-col" style="background: var(--color-ink);">
    <header class="grain relative shrink-0 flex items-center gap-8 px-6" style="height: 56px; border-bottom: 1px solid var(--color-hairline);">
      <a class="flex items-center gap-3 shrink-0 min-w-0" style="text-decoration: none;">
        <span class="shrink-0" style="width: 10px; height: 10px; background: var(--color-accent);"></span>
        <span class="font-display font-semibold truncate" style="font-size: 18px; letter-spacing: -0.01em;">Agent Park</span>
        <span class="caption shrink-0 hidden md:inline-flex" style="padding-left: 12px; border-left: 1px solid var(--color-hairline); margin-left: 4px;">
          2D ANIMATED<br/>CARTOON STUDIO
        </span>
      </a>

      <nav id="screen-tabs" class="flex items-center" style="height: 100%;"></nav>

      <div class="ml-auto flex items-center gap-3 shrink-0">
        <span id="show-name" class="caption caption-bright truncate" style="max-width: 260px;"></span>
        <button id="open-settings" class="btn-ghost" title="API keys &amp; preferences">
          Settings
        </button>
      </div>
    </header>
    <section id="screen-root" class="flex-1 overflow-hidden"></section>
  </main>
`;

document
  .getElementById('open-settings')
  ?.addEventListener('click', openSettings);

effect(() => {
  const el = document.getElementById('show-name');
  if (el) {
    const name = currentShow.value.name;
    el.textContent = name ? `PROJECT · ${name}` : '';
  }
});

// --- Tab nav ---
const tabsRoot = document.getElementById('screen-tabs')!;
SCREENS.forEach((s) => {
  const btn = document.createElement('button');
  btn.dataset.screen = s.id;
  btn.className = 'nav-tab';
  btn.innerHTML = `<span>${s.slate} · ${s.label.toUpperCase()}</span>`;
  btn.addEventListener('click', () => {
    currentScreen.value = s.id;
  });
  tabsRoot.appendChild(btn);
});

effect(() => {
  const active = currentScreen.value;
  tabsRoot.querySelectorAll<HTMLButtonElement>('[data-screen]').forEach((b) => {
    b.dataset.active = b.dataset.screen === active ? 'true' : 'false';
  });
});

// Clapboard sweep + scene slate flash on screen transition. This is the
// app's signature flourish — a 2px orange bar sweeps across the viewport
// (720ms out-quint) and a slate chip with the scene number/name briefly
// glows top-left. Fires on every non-initial screen change.
let firstScreenRun = true;
effect(() => {
  const id = currentScreen.value;
  if (firstScreenRun) {
    firstScreenRun = false;
    return;
  }
  const meta = SCREENS.find((s) => s.id === id);
  if (!meta) return;
  fireSceneTransition(meta.slate, meta.label);
});

function fireSceneTransition(slate: string, label: string): void {
  const sweep = document.createElement('div');
  sweep.className = 'clap-sweep';
  // Randomize the sweep's y-position a touch so consecutive transitions
  // feel hand-operated, not looped.
  sweep.style.top = `${30 + Math.floor(Math.random() * 30)}%`;
  document.body.appendChild(sweep);
  sweep.addEventListener('animationend', () => sweep.remove(), { once: true });

  const slateEl = document.createElement('div');
  slateEl.className = 'scene-slate';
  slateEl.innerHTML = `
    <span class="slate-no">${slate}</span>
    <span class="slate-name">${label}</span>
  `;
  document.body.appendChild(slateEl);
  slateEl.addEventListener('animationend', () => slateEl.remove(), {
    once: true,
  });
}

// --- Screen routing ---
const screenRoot = document.getElementById('screen-root')!;
const containers = new Map<Screen, HTMLDivElement>();
for (const s of SCREENS) {
  const div = document.createElement('div');
  div.className = 'h-full w-full';
  div.style.display = 'none';
  screenRoot.appendChild(div);
  containers.set(s.id, div);
}

mountStage(containers.get('stage')!);
mountDialogue(containers.get('dialogue')!);
mountPlay(containers.get('play')!);

effect(() => {
  const active = currentScreen.value;
  for (const [id, div] of containers) {
    div.style.display = id === active ? '' : 'none';
  }
});

void loadDefaults();
// Quietly checks GitHub Releases on launch; only renders a banner if a
// newer version exists and hasn't been dismissed. Skipped in dev builds.
void setupUpdateBanner();
