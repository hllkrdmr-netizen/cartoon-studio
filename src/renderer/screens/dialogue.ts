import { effect } from '@preact/signals-core';
import { currentScreen, currentShow, mutate } from '../state';
import { uid } from '../util';
import { openFormModal } from '../modal';
import { notify, notifyError } from '../notify';
import {
  PROVIDERS,
  type Provider,
  defaultVoice,
  defaultVoiceForProvider,
  findVoice,
  voicesForProvider,
} from '../../shared/voices';

// Keyed-by-id persistent line cards.
//
// Why this matters: typing in a textarea fires `input` → `mutate()` →
// `currentShow` change → render effect runs synchronously (signals-core flushes
// the batch before mutate returns). If the effect rebuilt the cards via
// innerHTML, the textarea node would be replaced on every keystroke and focus
// would drop after every character — which is exactly the focus bug the user
// reported.
//
// The fix: build each card once, hold a reference, and update fields in place.
// We only write to a control when its value differs from the desired state,
// AND for textareas we additionally skip the write when the textarea is the
// activeElement (so a stray equal-value-but-different-cursor scenario can't
// nuke the caret).
type LineCard = {
  el: HTMLDivElement;
  idxEl: HTMLSpanElement;
  speakerSel: HTMLSelectElement;
  providerSel: HTMLSelectElement;
  voiceSel: HTMLSelectElement;
  textArea: HTMLTextAreaElement;
  status: HTMLDivElement;
  // Inline audio preview that appears once the line has been generated.
  audioWrap: HTMLDivElement;
  audioEl: HTMLAudioElement;
  // Hash of (id,name) tuples for the speaker dropdown options. Lets us avoid
  // rebuilding the speaker <option>s every render.
  speakerOptionsSig: string;
  // Provider currently reflected in the voice dropdown. When the line's
  // provider changes, we rebuild voice options.
  voiceProvider: Provider | null;
  // File name of the audio currently loaded (not the full URL). When a
  // regenerate happens we compare and reload the <audio> element.
  loadedAudioFile: string | null;
};

const lineMap = new Map<string, LineCard>();
let linesRoot: HTMLDivElement | null = null;
let emptyEl: HTMLParagraphElement | null = null;
let noCastEl: HTMLDivElement | null = null;
let topBar: HTMLElement | null = null;

export function mountDialogue(root: HTMLElement): void {
  root.innerHTML = `
    <div class="flex flex-col h-full" style="background: var(--color-ink);">
      <header id="dialogue-top" class="shrink-0 flex items-end justify-between gap-6"
              style="padding: 28px 32px 16px; border-bottom: 1px solid var(--color-hairline);">
        <div class="min-w-0">
          <div class="caption mb-2">SC.02 · SCRIPT</div>
          <h2 class="font-display" style="font-size: 28px; font-weight: 500; letter-spacing: -0.015em; line-height: 1;">
            <span style="color: var(--color-text);">The </span><em style="color: var(--color-accent);">dialogue</em><span style="color: var(--color-text);">.</span>
          </h2>
          <p class="caption mt-2" style="color: var(--color-muted);">WRITE THE LINES · ASSIGN VOICES · GENERATE AUDIO</p>
        </div>
        <div class="flex gap-2 shrink-0">
          <button id="write-llm" class="btn-ghost inline-flex items-center gap-2 disabled:cursor-wait" style="border-color: var(--color-accent); color: var(--color-accent);">
            <span id="write-llm-spinner" class="ap-spinner hidden" style="width: 11px; height: 11px;"></span>
            <span id="write-llm-label">✦ Write with AI</span>
          </button>
          <button id="clear-lines" class="btn-ghost" title="Delete all dialogue lines"
                  style="border-color: var(--color-danger); color: var(--color-danger);">
            Clear all
          </button>
          <button id="add-line" class="btn-ghost">+ Line</button>
          <button id="generate-all" class="btn-primary inline-flex items-center gap-2 disabled:cursor-wait">
            <span id="generate-all-spinner" class="ap-spinner hidden" style="border-color: rgba(26,10,4,0.3); border-top-color: var(--color-accent-ink); width: 11px; height: 11px;"></span>
            <span id="generate-all-label">Generate all audio</span>
          </button>
        </div>
      </header>
      <div id="no-cast" class="hidden mx-8 mt-6 flex items-center gap-3"
           style="padding: 14px 18px; border: 1px solid var(--color-hairline); border-left: 2px solid var(--color-accent); background: var(--color-surface);">
        <span class="caption caption-accent">NOTE</span>
        <span style="color: var(--color-quiet); font-size: 13px;">No cast yet. Add at least one character on the
          <button data-goto="stage" class="underline" style="color: var(--color-accent);">Stage</button> screen before writing dialogue.
        </span>
      </div>
      <div id="lines" class="flex-1 overflow-y-auto" style="padding: 8px 32px 32px;"></div>
      <p id="lines-empty" class="hidden italic" style="padding: 24px 32px 40px; color: var(--color-muted); font-family: var(--font-display); font-size: 16px;">
        No lines yet. Begin with <span style="color: var(--color-text);">+ Line</span> or <span style="color: var(--color-accent);">✦ Write with AI</span>.
      </p>
    </div>
  `;

  topBar = root.querySelector<HTMLElement>('#dialogue-top')!;
  linesRoot = root.querySelector<HTMLDivElement>('#lines')!;
  emptyEl = root.querySelector<HTMLParagraphElement>('#lines-empty')!;
  noCastEl = root.querySelector<HTMLDivElement>('#no-cast')!;

  root
    .querySelector<HTMLButtonElement>('[data-goto="stage"]')!
    .addEventListener('click', () => {
      currentScreen.value = 'stage';
    });

  root
    .querySelector<HTMLButtonElement>('#add-line')!
    .addEventListener('click', () => {
      const v = defaultVoice();
      const speakerId = currentShow.value.characters[0]?.id ?? '';
      mutate((s) => ({
        ...s,
        dialogue: [
          ...s.dialogue,
          {
            id: uid('line'),
            speakerId,
            text: '',
            provider: v.provider,
            model: v.model,
            voice: v.voice,
          },
        ],
      }));
    });

  root
    .querySelector<HTMLButtonElement>('#clear-lines')!
    .addEventListener('click', () => {
      const count = currentShow.value.dialogue.length;
      if (count === 0) return;
      const confirmed = window.confirm(
        `Delete all ${count} dialogue ${count === 1 ? 'line' : 'lines'}? This cannot be undone.`,
      );
      if (!confirmed) return;
      mutate((s) => ({ ...s, dialogue: [] }));
      notify({
        kind: 'info',
        message: `Cleared ${count} dialogue ${count === 1 ? 'line' : 'lines'}.`,
      });
    });

  root
    .querySelector<HTMLButtonElement>('#write-llm')!
    .addEventListener('click', runWriteDialogue);

  const genAllBtn = root.querySelector<HTMLButtonElement>('#generate-all')!;
  const genAllSpinner = root.querySelector<HTMLSpanElement>(
    '#generate-all-spinner',
  )!;
  const genAllLabel = root.querySelector<HTMLSpanElement>(
    '#generate-all-label',
  )!;
  genAllBtn.addEventListener('click', async () => {
    const lines = currentShow.value.dialogue;
    if (lines.length === 0) return;
    genAllBtn.disabled = true;
    genAllSpinner.classList.remove('hidden');
    try {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const card = lineMap.get(line.id);
        genAllLabel.textContent = `Generating ${i + 1} / ${lines.length}…`;
        // Don't auto-play during the batch — the user clicked "Generate
        // all", not "play them all back-to-back as they finish".
        const result = await runGenerate(line.id, card?.status, {
          autoPlay: false,
        });
        if (!result.ok) {
          // Bail immediately on the first failure rather than firing the
          // same missing-key error N times. The single toast carries the
          // "Open Settings" action so the user can fix it in one click.
          notifyError(result.error, 'Batch audio generation failed.');
          break;
        }
      }
    } finally {
      genAllSpinner.classList.add('hidden');
      genAllLabel.textContent = 'Generate all audio';
      genAllBtn.disabled = false;
    }
  });

  effect(reconcile);
}

function reconcile(): void {
  if (!linesRoot || !emptyEl || !noCastEl) return;
  const show = currentShow.value;

  noCastEl.classList.toggle('hidden', show.characters.length > 0);
  // Disable Write/Add when there's no cast — meaningless without speakers.
  const buttons = topBar?.querySelectorAll<HTMLButtonElement>(
    '#write-llm, #clear-lines, #add-line, #generate-all',
  );
  buttons?.forEach((b) => {
    b.disabled = show.characters.length === 0;
    b.classList.toggle('opacity-40', show.characters.length === 0);
    b.classList.toggle('cursor-not-allowed', show.characters.length === 0);
  });

  emptyEl.classList.toggle(
    'hidden',
    show.dialogue.length > 0 || show.characters.length === 0,
  );

  // Drop cards for lines that no longer exist.
  const presentIds = new Set(show.dialogue.map((l) => l.id));
  for (const [id, card] of lineMap) {
    if (!presentIds.has(id)) {
      card.el.remove();
      lineMap.delete(id);
    }
  }

  const speakerOptionsSig = show.characters
    .map((c) => `${c.id}|${c.name}`)
    .join('');

  show.dialogue.forEach((line, idx) => {
    let card = lineMap.get(line.id);
    if (!card) {
      card = createLineCard(line.id, show.characters, speakerOptionsSig);
      lineMap.set(line.id, card);
      linesRoot!.appendChild(card.el);
    } else {
      // Keep DOM order in sync with show.dialogue order. appendChild on an
      // existing node moves it; focus is preserved per HTML spec.
      if (linesRoot!.children[idx] !== card.el) {
        linesRoot!.insertBefore(card.el, linesRoot!.children[idx] ?? null);
      }
    }

    card.idxEl.textContent = String(idx + 1);

    if (card.speakerOptionsSig !== speakerOptionsSig) {
      card.speakerSel.innerHTML = renderSpeakerOptions(show.characters);
      card.speakerOptionsSig = speakerOptionsSig;
    }
    if (card.speakerSel.value !== line.speakerId) {
      card.speakerSel.value = line.speakerId;
    }

    // Provider dropdown reflects the line's current provider; voice dropdown
    // is rebuilt whenever the provider changes so options stay consistent.
    const provider = line.provider as Provider;
    if (card.providerSel.value !== provider) card.providerSel.value = provider;
    if (card.voiceProvider !== provider) {
      card.voiceSel.innerHTML = renderVoiceOptions(provider);
      card.voiceProvider = provider;
    }
    const voiceVal = `${line.model}|${line.voice}`;
    if (card.voiceSel.value !== voiceVal) card.voiceSel.value = voiceVal;

    if (
      card.textArea.value !== line.text &&
      document.activeElement !== card.textArea
    ) {
      card.textArea.value = line.text;
    }
  });
}

function createLineCard(
  lineId: string,
  characters: ReturnType<typeof currentShow.value.characters.slice>,
  speakerOptionsSig: string,
): LineCard {
  const el = document.createElement('div');
  el.className = 'group line-row';
  el.dataset.lineId = lineId;
  el.innerHTML = `
    <div class="flex items-start gap-4" style="padding: 18px 0; border-bottom: 1px solid var(--color-hairline);">
      <div class="shrink-0 flex items-center gap-3" style="width: 44px;">
        <span data-idx class="caption" style="font-size: 11px; color: var(--color-muted); width: 28px;"></span>
      </div>
      <div class="flex-1 min-w-0 space-y-2.5">
        <div class="flex items-center gap-3 flex-wrap">
          <select data-field="speaker" style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; padding: 5px 24px 5px 8px; min-width: 130px;"></select>
          <span class="caption" style="font-size: 9px;">VOICE</span>
          <select data-field="provider" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em; padding: 5px 22px 5px 8px; min-width: 110px;">
            ${PROVIDERS.map(
              (p) => `<option value="${p.id}">${p.label}</option>`,
            ).join('')}
          </select>
          <select data-field="voice" style="font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.04em; padding: 5px 22px 5px 8px; min-width: 180px; flex: 1;"></select>
          <div class="ml-auto flex items-center gap-1">
            <button data-action="generate" title="Generate &amp; play (regenerates each press)"
                    class="line-icon-btn"
                    style="color: var(--color-accent);">
              <span data-play-icon style="font-size: 11px;">▶</span>
              <span data-spinner class="ap-spinner hidden" style="width: 12px; height: 12px;"></span>
            </button>
            <button data-action="delete" title="Delete line"
                    class="line-icon-btn"
                    style="color: var(--color-muted);">
              <span style="font-size: 13px;">×</span>
            </button>
          </div>
        </div>
        <textarea
          data-field="text"
          rows="2"
          placeholder="Type the line…"
          style="font-family: var(--font-display); font-style: italic; font-size: 17px; line-height: 1.55; color: var(--color-text); background: transparent; border: 0; padding: 4px 0 6px; resize: vertical; width: 100%;"
        ></textarea>
        <div data-audio-wrap class="hidden">
          <div class="ap-audio" data-playing="false">
            <button data-audio-btn class="ap-audio-btn" aria-label="Play preview">
              <span data-audio-icon>▶</span>
            </button>
            <div data-audio-bar class="ap-audio-bar">
              <div class="ap-audio-bar-track">
                <div data-audio-fill class="ap-audio-bar-fill"></div>
              </div>
              <div data-audio-handle class="ap-audio-bar-handle"></div>
            </div>
            <span data-audio-time class="ap-audio-time">00:00 / 00:00</span>
            <audio data-audio preload="metadata" style="display: none;"></audio>
          </div>
        </div>
        <div data-status class="caption" style="font-size: 9.5px; min-height: 12px;"></div>
      </div>
    </div>
  `;

  const idxEl = el.querySelector<HTMLSpanElement>('[data-idx]')!;
  const speakerSel = el.querySelector<HTMLSelectElement>(
    '[data-field="speaker"]',
  )!;
  speakerSel.innerHTML = renderSpeakerOptions(characters);
  const providerSel = el.querySelector<HTMLSelectElement>(
    '[data-field="provider"]',
  )!;
  const voiceSel = el.querySelector<HTMLSelectElement>('[data-field="voice"]')!;
  const textArea = el.querySelector<HTMLTextAreaElement>('[data-field="text"]')!;
  const status = el.querySelector<HTMLDivElement>('[data-status]')!;
  const audioWrap = el.querySelector<HTMLDivElement>('[data-audio-wrap]')!;
  const audioEl = el.querySelector<HTMLAudioElement>('[data-audio]')!;
  wireMiniPlayer(el, audioEl);

  speakerSel.addEventListener('change', () => {
    updateLine(lineId, { speakerId: speakerSel.value });
  });
  providerSel.addEventListener('change', () => {
    const p = providerSel.value as Provider;
    // Switching provider means the old model/voice aren't valid. Pick the
    // provider's first voice as a sensible default; the user can refine.
    const v = defaultVoiceForProvider(p);
    updateLine(lineId, { provider: p, model: v.model, voice: v.voice });
  });
  voiceSel.addEventListener('change', () => {
    const [model, voice] = voiceSel.value.split('|');
    const v = findVoice(model, voice);
    if (!v) return;
    updateLine(lineId, { model: v.model, voice: v.voice, provider: v.provider });
  });
  textArea.addEventListener('input', () => {
    updateLine(lineId, { text: textArea.value });
  });

  el.querySelector<HTMLButtonElement>('[data-action="delete"]')!.addEventListener(
    'click',
    () => {
      mutate((s) => ({
        ...s,
        dialogue: s.dialogue.filter((l) => l.id !== lineId),
      }));
    },
  );

  const genBtn = el.querySelector<HTMLButtonElement>(
    '[data-action="generate"]',
  )!;
  genBtn.addEventListener('click', () => {
    // Always force regenerate on ▶. The user's mental model is "play this
    // line" — they want a fresh take each time, not cached playback. If
    // they just want to replay what's already there, the inline <audio>
    // controls beneath do that.
    void runGenerate(lineId, status, { force: true, autoPlay: true });
  });

  return {
    el,
    idxEl,
    speakerSel,
    providerSel,
    voiceSel,
    textArea,
    status,
    audioWrap,
    audioEl,
    speakerOptionsSig,
    voiceProvider: null,
    loadedAudioFile: null,
  };
}

function renderSpeakerOptions(
  characters: ReturnType<typeof currentShow.value.characters.slice>,
): string {
  if (characters.length === 0) {
    return '<option value="">— no cast —</option>';
  }
  return characters
    .map(
      (c) =>
        `<option value="${c.id}">${escapeHtml(c.name)}</option>`,
    )
    .join('');
}

function renderVoiceOptions(provider: Provider): string {
  return voicesForProvider(provider)
    .map(
      (v) =>
        `<option value="${v.model}|${v.voice}">${escapeHtml(v.label)}</option>`,
    )
    .join('');
}

function updateLine(
  id: string,
  patch: Partial<{
    speakerId: string;
    text: string;
    provider: string;
    model: string;
    voice: string;
  }>,
): void {
  mutate((s) => ({
    ...s,
    dialogue: s.dialogue.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  }));
}

async function runWriteDialogue(): Promise<void> {
  const writeBtn = topBar?.querySelector<HTMLButtonElement>('#write-llm') ?? null;
  const writeSpinner =
    topBar?.querySelector<HTMLSpanElement>('#write-llm-spinner') ?? null;
  const writeLabel =
    topBar?.querySelector<HTMLSpanElement>('#write-llm-label') ?? null;
  const show = currentShow.value;
  if (show.characters.length === 0) {
    notify({
      kind: 'warning',
      message: 'Add at least one character to the show first.',
    });
    return;
  }
  const result = await openFormModal({
    title: 'Write dialogue with AI',
    description:
      'Give the model a premise and a line count. It writes the lines as an array of cards — audio is generated separately (per-line ▶ or Generate all audio).',
    fields: [
      {
        id: 'premise',
        label: 'Premise',
        type: 'textarea',
        rows: 3,
        required: true,
        placeholder:
          'e.g. Bill and Ted argue about pineapple pizza at a bus stop',
      },
      {
        id: 'lineCount',
        label: 'How many lines?',
        type: 'number',
        defaultValue: 6,
        min: 1,
        max: 50,
        required: true,
      },
    ],
    submitLabel: 'Write',
  });
  if (!result) return;
  const premise = result.premise;
  const lineCount = parseInt(result.lineCount, 10);
  if (!Number.isFinite(lineCount) || lineCount <= 0) return;
  if (writeBtn) writeBtn.disabled = true;
  writeSpinner?.classList.remove('hidden');
  if (writeLabel) writeLabel.textContent = 'Writing…';
  try {
    const lines = await window.api.llmGenerateDialogue({
      premise,
      cast: show.characters.map((c) => ({ id: c.id, name: c.name })),
      lineCount,
    });
    mutate((s) => ({
      ...s,
      dialogue: [
        ...s.dialogue,
        ...lines.map((l) => ({
          id: uid('line'),
          speakerId: l.speakerId,
          text: l.text,
          provider: l.provider,
          model: l.model,
          voice: l.voice,
        })),
      ],
    }));
  } catch (err) {
    notifyError(err, 'Generate failed.');
  } finally {
    writeSpinner?.classList.add('hidden');
    if (writeLabel) writeLabel.textContent = '✦ Write with AI';
    if (writeBtn) writeBtn.disabled = false;
  }
}

type GenerateOptions = {
  force?: boolean;
  // Auto-play the resulting audio. True for individual ▶ clicks (the user
  // pressed play), false for batch "Generate all audio" (where playing each
  // clip back-to-back as they generate is what the user called out as noisy).
  autoPlay?: boolean;
};

async function runGenerate(
  lineId: string,
  status?: HTMLElement | null,
  options: GenerateOptions = {},
): Promise<{ ok: true } | { ok: false; error: unknown }> {
  const { force = false, autoPlay = true } = options;
  const show = currentShow.value;
  const line = show.dialogue.find((l) => l.id === lineId);
  if (!line || !line.text.trim()) {
    if (status) status.textContent = 'Empty line — nothing to generate.';
    return { ok: true };
  }
  const card = lineMap.get(lineId);
  setLineLoading(card, true);
  if (status)
    status.textContent = force ? 'Regenerating…' : 'Generating…';
  try {
    const r = await window.api.ttsGenerateLine({
      showId: show.id,
      lineId,
      text: line.text,
      provider: line.provider,
      model: line.model,
      voice: line.voice,
      force,
    });
    if (status) {
      status.textContent = `${r.cached ? 'cached' : 'generated'} · ${r.words.length} words`;
    }
    await attachAudio(lineId, show.id, r.audioFile);
    if (autoPlay && card) {
      card.audioEl.currentTime = 0;
      card.audioEl.play().catch(() => {});
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (status) status.textContent = `error: ${msg}`;
    // Toast for individual ▶ clicks so the user gets a one-click "Open
    // Settings" affordance on missing-key errors. Batch handler routes
    // its own error through notifyError exactly once after bailing.
    if (autoPlay) notifyError(err, 'Audio generation failed.');
    return { ok: false, error: err };
  } finally {
    setLineLoading(card, false);
  }
}

// Hook the custom mini-player UI into the underlying <audio> element.
// The audio element is the source of truth for playback state; the UI
// just mirrors timeupdate/play/pause/ended events. Click on the bar
// seeks. The card gets data-playing="true" so the bar handle scales in
// even when the user isn't hovering.
function wireMiniPlayer(card: HTMLElement, audio: HTMLAudioElement): void {
  const wrap = card.querySelector<HTMLDivElement>('.ap-audio')!;
  const btn = card.querySelector<HTMLButtonElement>('[data-audio-btn]')!;
  const icon = card.querySelector<HTMLSpanElement>('[data-audio-icon]')!;
  const bar = card.querySelector<HTMLDivElement>('[data-audio-bar]')!;
  const fill = card.querySelector<HTMLDivElement>('[data-audio-fill]')!;
  const handle = card.querySelector<HTMLDivElement>('[data-audio-handle]')!;
  const timeEl = card.querySelector<HTMLSpanElement>('[data-audio-time]')!;

  btn.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  audio.addEventListener('play', () => {
    icon.textContent = '⏸';
    wrap.dataset.playing = 'true';
  });
  audio.addEventListener('pause', () => {
    icon.textContent = '▶';
    wrap.dataset.playing = 'false';
  });
  audio.addEventListener('ended', () => {
    icon.textContent = '▶';
    wrap.dataset.playing = 'false';
    fill.style.width = '0%';
    handle.style.left = '0%';
    audio.currentTime = 0;
  });
  audio.addEventListener('timeupdate', () => updatePosition());
  audio.addEventListener('loadedmetadata', () => updatePosition());
  audio.addEventListener('durationchange', () => updatePosition());

  bar.addEventListener('click', (ev) => {
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const d = audio.duration;
    if (Number.isFinite(d) && d > 0) {
      audio.currentTime = ratio * d;
      updatePosition();
    }
  });

  function updatePosition(): void {
    const d = audio.duration;
    const t = audio.currentTime;
    const pct = Number.isFinite(d) && d > 0 ? (t / d) * 100 : 0;
    fill.style.width = `${pct}%`;
    handle.style.left = `${pct}%`;
    timeEl.textContent = `${formatAudioTime(t)} / ${formatAudioTime(Number.isFinite(d) ? d : 0)}`;
  }
}

function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function setLineLoading(card: LineCard | undefined, loading: boolean): void {
  if (!card) return;
  const genBtn = card.el.querySelector<HTMLButtonElement>(
    '[data-action="generate"]',
  );
  const playIcon = card.el.querySelector<HTMLSpanElement>('[data-play-icon]');
  const spinner = card.el.querySelector<HTMLSpanElement>('[data-spinner]');
  const deleteBtn = card.el.querySelector<HTMLButtonElement>(
    '[data-action="delete"]',
  );
  if (genBtn) genBtn.disabled = loading;
  if (deleteBtn) deleteBtn.disabled = loading;
  if (playIcon) playIcon.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
  card.el.dataset.loading = loading ? 'true' : 'false';
}

async function attachAudio(
  lineId: string,
  showId: string,
  audioFile: string,
): Promise<void> {
  const card = lineMap.get(lineId);
  if (!card) return;
  // Always reload with a fresh cache-bust param. The audio file has a
  // stable per-line filename (line_xyz.mp3), so regenerations overwrite
  // the same path — without busting, the <audio> element keeps the old
  // decoded buffer and the user hears the previous take.
  const url = await window.api.audioUrl(showId, audioFile);
  card.audioEl.src = `${url}?t=${Date.now()}`;
  card.audioEl.load();
  card.loadedAudioFile = audioFile;
  card.audioWrap.classList.remove('hidden');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
