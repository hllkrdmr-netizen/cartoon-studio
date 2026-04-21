import { effect } from '@preact/signals-core';
import { currentShow, mutate, selection } from '../state';
import { uid } from '../util';
import { VOICES, defaultVoice } from '../../shared/voices';

export function mountDialogue(root: HTMLElement): void {
  effect(() => {
    const show = currentShow.value;

    root.innerHTML = `
      <div class="flex flex-col h-full">
        <div class="p-3 border-b border-neutral-800 flex items-center justify-between gap-2">
          <h2 class="text-xs font-semibold uppercase tracking-wide text-neutral-400">Dialogue</h2>
          <div class="flex gap-1">
            <button id="generate-all" class="text-xs rounded border border-neutral-700 hover:border-neutral-500 px-2 py-1">
              Generate all
            </button>
            <button id="add-line" class="text-xs rounded border border-neutral-700 hover:border-neutral-500 px-2 py-1">
              + Line
            </button>
          </div>
        </div>
        <div id="lines" class="flex-1 overflow-y-auto p-3 space-y-2"></div>
      </div>
    `;

    const lines = root.querySelector<HTMLDivElement>('#lines')!;

    if (show.dialogue.length === 0) {
      lines.innerHTML =
        '<p class="text-xs text-neutral-500">No lines yet. Add one above.</p>';
    }

    show.dialogue.forEach((line, idx) => {
      const card = document.createElement('div');
      const isSelected =
        selection.value.type === 'line' && selection.value.id === line.id;
      card.className = `rounded border ${isSelected ? 'border-emerald-500/70' : 'border-neutral-800'} bg-neutral-900 p-2 text-xs space-y-1`;
      card.innerHTML = `
        <div class="flex items-center gap-1">
          <span class="text-neutral-500 w-4">${idx + 1}</span>
          <select data-field="speakerId" class="flex-1 bg-neutral-800 rounded px-1 py-0.5">
            ${show.characters
              .map(
                (c) =>
                  `<option value="${c.id}" ${c.id === line.speakerId ? 'selected' : ''}>${c.name}</option>`,
              )
              .join('')}
          </select>
          <select data-field="voice" class="flex-1 bg-neutral-800 rounded px-1 py-0.5">
            ${VOICES.map(
              (v) =>
                `<option value="${v.model}|${v.voice}" ${
                  v.model === line.model && v.voice === line.voice
                    ? 'selected'
                    : ''
                }>${v.label}</option>`,
            ).join('')}
          </select>
          <button data-action="generate" title="Generate audio" class="text-neutral-400 hover:text-emerald-400">▶</button>
          <button data-action="delete" title="Delete" class="text-neutral-500 hover:text-red-400">×</button>
        </div>
        <textarea
          data-field="text"
          rows="2"
          class="w-full bg-neutral-800 rounded p-1 text-neutral-100 resize-y"
          placeholder="What does this character say?"
        >${escapeHtml(line.text)}</textarea>
        <div data-status class="text-[10px] text-neutral-500"></div>
      `;

      card.addEventListener('click', (ev) => {
        if ((ev.target as HTMLElement).tagName !== 'BUTTON') {
          selection.value = { type: 'line', id: line.id };
        }
      });

      const speakerSel = card.querySelector<HTMLSelectElement>(
        '[data-field="speakerId"]',
      )!;
      speakerSel.addEventListener('change', () => {
        updateLine(line.id, { speakerId: speakerSel.value });
      });

      const voiceSel = card.querySelector<HTMLSelectElement>(
        '[data-field="voice"]',
      )!;
      voiceSel.addEventListener('change', () => {
        const [model, voice] = voiceSel.value.split('|');
        const provider =
          VOICES.find((v) => v.model === model && v.voice === voice)
            ?.provider ?? 'elevenlabs';
        updateLine(line.id, { model, voice, provider });
      });

      const textArea = card.querySelector<HTMLTextAreaElement>(
        '[data-field="text"]',
      )!;
      textArea.addEventListener('input', () => {
        updateLine(line.id, { text: textArea.value });
      });

      const deleteBtn = card.querySelector<HTMLButtonElement>(
        '[data-action="delete"]',
      )!;
      deleteBtn.addEventListener('click', () => {
        mutate((s) => ({
          ...s,
          dialogue: s.dialogue.filter((l) => l.id !== line.id),
        }));
      });

      const generateBtn = card.querySelector<HTMLButtonElement>(
        '[data-action="generate"]',
      )!;
      const status = card.querySelector<HTMLDivElement>('[data-status]')!;
      generateBtn.addEventListener('click', async () => {
        await runGenerate(line.id, status);
      });

      lines.appendChild(card);
    });

    root
      .querySelector<HTMLButtonElement>('#generate-all')
      ?.addEventListener('click', async () => {
        for (const line of currentShow.value.dialogue) {
          await runGenerate(line.id);
        }
      });

    root.querySelector('#add-line')?.addEventListener('click', () => {
      const v = defaultVoice();
      const speakerId =
        currentShow.value.characters[0]?.id ?? '';
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
  });
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

async function runGenerate(
  lineId: string,
  status?: HTMLElement | null,
): Promise<void> {
  const show = currentShow.value;
  const line = show.dialogue.find((l) => l.id === lineId);
  if (!line || !line.text.trim()) {
    if (status) status.textContent = 'Empty line — nothing to generate.';
    return;
  }
  if (status) status.textContent = 'Generating…';
  try {
    const r = await window.api.ttsGenerateLine({
      showId: show.id,
      lineId,
      text: line.text,
      provider: line.provider,
      model: line.model,
      voice: line.voice,
    });
    if (status) {
      status.textContent = `${r.cached ? 'cached' : 'generated'} · ${r.words.length} words`;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (status) status.textContent = `error: ${msg}`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
