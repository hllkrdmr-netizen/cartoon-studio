import { effect, signal } from '@preact/signals-core';
import { currentScreen, currentShow } from '../state';

let lastBuiltSig = '';

const isReady = signal(false);
const isPlaying = signal(false);
const currentTime = signal(0);
const totalDuration = signal(0);

// Status is a union of compact labels — no long paths, no raw log lines, no
// layout shift. Details (e.g. the output path) live in separate state that's
// rendered in a stable-slot row underneath.
type Status =
  | { kind: 'idle' }
  | { kind: 'building' }
  | { kind: 'ready'; duration: number; missing: number }
  | { kind: 'error'; message: string }
  | { kind: 'rendering' }
  | { kind: 'saved'; path: string }
  | { kind: 'render-failed'; message: string };
const status = signal<Status>({ kind: 'idle' });

let iframeEl: HTMLIFrameElement | null = null;

function send(type: string, extra: Record<string, unknown> = {}): void {
  if (!iframeEl?.contentWindow) return;
  iframeEl.contentWindow.postMessage({ type, ...extra }, '*');
}

window.addEventListener('message', (ev) => {
  const d = ev.data as {
    type?: string;
    duration?: number;
    t?: number;
  } | null;
  if (!d?.type?.startsWith('agentpark:')) return;
  if (d.type === 'agentpark:ready') {
    isReady.value = true;
    if (typeof d.duration === 'number') totalDuration.value = d.duration;
  } else if (d.type === 'agentpark:tick' && typeof d.t === 'number') {
    currentTime.value = d.t;
  } else if (d.type === 'agentpark:ended') {
    isPlaying.value = false;
    currentTime.value = totalDuration.value;
  }
});

export function mountPlay(root: HTMLElement): void {
  root.innerHTML = `
    <div class="flex flex-col h-full" style="background: var(--color-ink);">
      <header class="shrink-0 flex items-end justify-between gap-6"
              style="padding: 28px 32px 16px; border-bottom: 1px solid var(--color-hairline);">
        <div class="min-w-0">
          <div class="caption mb-2">SC.03 · PLAYBACK</div>
          <h2 class="font-display" style="font-size: 28px; font-weight: 500; letter-spacing: -0.015em; line-height: 1;">
            <span style="color: var(--color-text);">The </span><em style="color: var(--color-accent);">final cut</em><span style="color: var(--color-text);">.</span>
          </h2>
          <p class="caption mt-2" style="color: var(--color-muted);">PREVIEW THE COMPOSITION · EXPORT TO MP4</p>
        </div>
        <div class="flex items-center gap-3 shrink-0">
          <span id="status-pill" class="caption" style="font-size: 10.5px;"></span>
          <button id="rebuild" class="btn-ghost">Rebuild</button>
          <button id="render" class="btn-primary">Render ↗ MP4</button>
        </div>
      </header>
      <div id="sub-row" class="hidden items-center gap-3" style="padding: 8px 32px; border-bottom: 1px solid var(--color-hairline);"></div>
      <div id="empty" class="hidden flex-1 flex items-center justify-center text-center" style="padding: 32px;"></div>
      <div id="player-wrap" class="flex-1 flex flex-col min-h-0">
        <div class="flex-1 flex items-center justify-center min-h-0 overflow-hidden vignette" style="padding: 32px;">
          <div id="cabinet" class="relative" style="width: 100%; max-width: 64rem; max-height: 100%; aspect-ratio: 16/9;">
            <!-- Filmstrip perforation strip, top -->
            <div class="perforation absolute -top-4 left-0 right-0" style="height: 8px; background-color: transparent;"></div>
            <!-- Slate chip floating top-left of the cabinet -->
            <div class="slate-chip absolute" style="top: -34px; left: 0; z-index: 5;">
              <span>SC.03</span>
              <span style="color: var(--color-muted);">|</span>
              <span style="color: var(--color-quiet); font-family: var(--font-mono); letter-spacing: 0.1em;">FINAL CUT</span>
            </div>
            <!-- The video cabinet itself -->
            <div class="absolute inset-0 overflow-hidden" style="background: #0a0b0c; box-shadow: 0 0 0 1px var(--color-hairline-strong), 0 32px 64px -28px rgba(0,0,0,0.85);">
              <iframe
                id="preview-iframe"
                class="absolute inset-0 w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin"
                title="composition preview"
              ></iframe>
              <div id="loading-overlay"
                   class="absolute inset-0 flex items-center justify-center pointer-events-none"
                   style="background: rgba(14,15,16,0.55);">
                <div class="flex items-center gap-3">
                  <span class="ap-spinner"></span>
                  <span class="caption">LOADING</span>
                </div>
              </div>
            </div>
            <!-- Filmstrip perforation strip, bottom -->
            <div class="perforation absolute -bottom-4 left-0 right-0" style="height: 8px; background-color: transparent;"></div>
          </div>
        </div>
        <div class="shrink-0 flex items-center gap-4"
             style="padding: 16px 32px 22px; border-top: 1px solid var(--color-hairline); background: var(--color-ink);">
          <button id="play-pause" class="btn-ghost" style="min-width: 96px;">Play</button>
          <button id="restart" class="btn-ghost">Restart</button>
          <input id="scrub" type="range" min="0" max="1000" value="0" step="1" class="ap-scrub flex-1" />
          <span id="time" class="caption" style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.06em; color: var(--color-quiet); width: 110px; text-align: right;">00:00 / 00:00</span>
        </div>
      </div>
    </div>
  `;

  iframeEl = root.querySelector<HTMLIFrameElement>('#preview-iframe')!;
  const loadingOverlay = root.querySelector<HTMLDivElement>('#loading-overlay')!;
  const emptyEl = root.querySelector<HTMLDivElement>('#empty')!;
  const playerWrap = root.querySelector<HTMLDivElement>('#player-wrap')!;
  const statusPill = root.querySelector<HTMLSpanElement>('#status-pill')!;
  const subRow = root.querySelector<HTMLDivElement>('#sub-row')!;
  const playPauseBtn = root.querySelector<HTMLButtonElement>('#play-pause')!;
  const restartBtn = root.querySelector<HTMLButtonElement>('#restart')!;
  const scrub = root.querySelector<HTMLInputElement>('#scrub')!;
  const timeEl = root.querySelector<HTMLSpanElement>('#time')!;
  const rebuildBtn = root.querySelector<HTMLButtonElement>('#rebuild')!;
  const renderBtn = root.querySelector<HTMLButtonElement>('#render')!;

  playPauseBtn.addEventListener('click', () => {
    if (!isReady.value) return;
    if (isPlaying.value) {
      send('agentpark:pause');
      isPlaying.value = false;
    } else {
      send('agentpark:play');
      isPlaying.value = true;
    }
  });
  restartBtn.addEventListener('click', () => {
    if (!isReady.value) return;
    send('agentpark:restart');
    isPlaying.value = true;
    currentTime.value = 0;
  });
  scrub.addEventListener('input', () => {
    if (!isReady.value || totalDuration.value === 0) return;
    const t = (parseInt(scrub.value, 10) / 1000) * totalDuration.value;
    send('agentpark:seek', { t });
    currentTime.value = t;
    isPlaying.value = false;
  });
  rebuildBtn.addEventListener('click', () => {
    lastBuiltSig = '';
    void reloadIframe();
  });
  renderBtn.addEventListener('click', async () => {
    status.value = { kind: 'rendering' };
    const off = window.api.onRenderProgress((p) => {
      if (p.type === 'done') status.value = { kind: 'saved', path: p.outputPath };
      else if (p.type === 'error')
        status.value = { kind: 'render-failed', message: p.message };
      // 'start' and 'log' events intentionally ignored here — the rendering
      // pill already tells the user what's happening, and log lines in the
      // header were the source of the layout-shift complaint.
    });
    try {
      await window.api.buildComposition(currentShow.value.id);
      await window.api.renderShow(currentShow.value.id);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg !== 'cancelled') {
        status.value = { kind: 'render-failed', message: msg };
      } else if (status.value.kind === 'rendering') {
        // User cancelled the save dialog.
        status.value = { kind: 'idle' };
      }
    } finally {
      off();
    }
  });

  effect(() => {
    if (currentScreen.value !== 'play') return;
    const show = currentShow.value;
    const sig = JSON.stringify(show);
    const prereq = !show.scene || show.characters.length === 0;
    if (prereq) {
      playerWrap.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      emptyEl.innerHTML = `
        <div class="space-y-3 max-w-md">
          <div class="caption">SC.03 · NOT READY</div>
          <p class="font-display italic" style="font-size: 22px; color: var(--color-quiet);">
            Nothing to play yet. Add ${show.characters.length === 0 ? 'cast' : 'a scene'} first.
          </p>
          <button data-goto="stage" class="btn-primary mt-2">← Back to Stage</button>
        </div>
      `;
      emptyEl
        .querySelector<HTMLButtonElement>('[data-goto="stage"]')!
        .addEventListener('click', () => {
          currentScreen.value = 'stage';
        });
      return;
    }
    playerWrap.classList.remove('hidden');
    emptyEl.classList.add('hidden');
    if (sig !== lastBuiltSig) {
      lastBuiltSig = sig;
      void reloadIframe();
    }
  });

  effect(() => {
    const ready = isReady.value;
    playPauseBtn.disabled = !ready;
    restartBtn.disabled = !ready;
    scrub.disabled = !ready;
    loadingOverlay.style.display = ready ? 'none' : '';
  });
  effect(() => {
    playPauseBtn.textContent = isPlaying.value ? 'Pause' : 'Play';
  });
  effect(() => {
    const t = currentTime.value;
    const d = totalDuration.value;
    timeEl.textContent = `${formatTime(t)} / ${formatTime(d)}`;
    if (d > 0 && document.activeElement !== scrub) {
      scrub.value = String(Math.round((t / d) * 1000));
    }
  });

  // Status caption — tracked-out Departure Mono, color-coded by state.
  effect(() => {
    const s = status.value;
    const [label, color, title] = pillFor(s);
    statusPill.textContent = label;
    statusPill.style.color = color;
    statusPill.title = title;
  });

  // Sub-row appears only for 'saved' (with a Reveal button) or for errors
  // that warrant showing the full text. Hidden otherwise — no layout shift.
  effect(() => {
    const s = status.value;
    subRow.innerHTML = '';
    if (s.kind === 'saved') {
      subRow.style.display = 'flex';
      const cap = document.createElement('span');
      cap.className = 'caption caption-accent';
      cap.textContent = 'OUTPUT';
      const text = document.createElement('span');
      text.className = 'truncate flex-1';
      text.style.cssText =
        'font-family: var(--font-mono); font-size: 11px; color: var(--color-quiet);';
      text.textContent = s.path;
      text.title = s.path;
      const reveal = document.createElement('button');
      reveal.className = 'btn-ghost';
      reveal.textContent = 'Reveal';
      reveal.addEventListener('click', () =>
        window.api.revealInFolder(s.path),
      );
      subRow.appendChild(cap);
      subRow.appendChild(text);
      subRow.appendChild(reveal);
    } else if (s.kind === 'error' || s.kind === 'render-failed') {
      subRow.style.display = 'flex';
      const cap = document.createElement('span');
      cap.className = 'caption';
      cap.style.color = 'var(--color-danger)';
      cap.textContent = 'ERROR';
      const span = document.createElement('span');
      span.className = 'truncate';
      span.style.cssText =
        'font-size: 12px; color: var(--color-quiet); font-style: italic;';
      span.textContent = s.message;
      span.title = s.message;
      subRow.appendChild(cap);
      subRow.appendChild(span);
    } else {
      subRow.style.display = 'none';
    }
  });
}

function pillFor(s: Status): [string, string, string] {
  // Returns [label, color CSS var or hex, hover title]. Uses our token
  // colors directly — accent for active states, muted for neutral, danger
  // for errors. No background pill — caption-style, fits the editorial.
  switch (s.kind) {
    case 'idle':
      return ['', 'transparent', ''];
    case 'building':
      return ['◐ BUILDING', 'var(--color-quiet)', 'Compiling composition'];
    case 'ready':
      return [
        s.missing > 0
          ? `● READY · ${s.missing} LINE${s.missing === 1 ? '' : 'S'} PENDING`
          : '● READY',
        'var(--color-accent)',
        `Built · ${s.duration.toFixed(1)}s`,
      ];
    case 'error':
      return ['✕ BUILD FAILED', 'var(--color-danger)', s.message];
    case 'rendering':
      return ['◐ RENDERING', 'var(--color-accent)', 'Exporting MP4'];
    case 'saved':
      return ['● SAVED', 'var(--color-accent)', s.path];
    case 'render-failed':
      return ['✕ RENDER FAILED', 'var(--color-danger)', s.message];
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds * 100) % 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

async function reloadIframe(): Promise<void> {
  if (!iframeEl) return;
  isReady.value = false;
  isPlaying.value = false;
  currentTime.value = 0;
  totalDuration.value = 0;

  const show = currentShow.value;
  status.value = { kind: 'building' };
  let r: Awaited<ReturnType<typeof window.api.buildComposition>>;
  try {
    r = await window.api.buildComposition(show.id);
  } catch (err) {
    status.value = { kind: 'error', message: (err as Error).message };
    return;
  }
  status.value = {
    kind: 'ready',
    duration: r.duration,
    missing: r.missingLines.length,
  };
  const url = await window.api.previewUrl(show.id);
  iframeEl.src = url;
}
