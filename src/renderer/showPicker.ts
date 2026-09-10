import { effect } from '@preact/signals-core';
import {
  allShows,
  currentShow,
  loadShow,
  createShow,
  createMinoPilotShow,
  renameCurrentShow,
  deleteShow,
} from './state';
import { openFormModal } from './modal';
import { notify, notifyError } from './notify';

// Header show-picker. Single chip showing the current show's name; click
// to open a dropdown with "+ New show", switch list, rename, delete.
//
// The panel is PORTALED to document.body and positioned with fixed
// coordinates computed from the chip's bounding rect. The header lives
// inside an `isolation: isolate` stacking context (.grain) and is a
// sibling of #screen-root, which means anything nested inside the header
// gets painted under screen content. Portaling sidesteps the whole mess.
//
// Implementation notes:
//   - Click handling on the panel uses event delegation so listeners
//     survive every renderPanel() innerHTML reset.
//   - Delete uses an in-app modal, NOT window.confirm — Electron disables
//     window.confirm in the renderer, same as window.prompt.

export function mountShowPicker(host: HTMLElement): void {
  host.innerHTML = `
    <div class="show-picker" data-picker>
      <button class="show-picker-chip" data-toggle title="Switch show, rename, or create new" type="button">
        <span class="caption" style="color: var(--color-quiet);">SHOW</span>
        <span class="show-picker-name" data-name></span>
        <span class="show-picker-caret" aria-hidden="true"></span>
      </button>
    </div>
  `;

  const chip = host.querySelector<HTMLButtonElement>('[data-toggle]')!;
  const nameEl = host.querySelector<HTMLSpanElement>('[data-name]')!;

  const panel = document.createElement('div');
  panel.className = 'show-picker-panel';
  panel.hidden = true;
  document.body.appendChild(panel);

  effect(() => {
    nameEl.textContent = currentShow.value.name;
  });

  let isOpen = false;

  const positionPanel = (): void => {
    const r = chip.getBoundingClientRect();
    panel.style.top = `${Math.round(r.bottom + 6)}px`;
    panel.style.right = `${Math.round(window.innerWidth - r.right)}px`;
  };

  const close = (): void => {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    document.removeEventListener('mousedown', onDocMouseDown, true);
    document.removeEventListener('keydown', onDocKeydown);
    window.removeEventListener('resize', positionPanel);
    window.removeEventListener('scroll', positionPanel, true);
  };

  const open = (): void => {
    if (isOpen) return;
    isOpen = true;
    chip.setAttribute('aria-expanded', 'true');
    renderPanel();
    positionPanel();
    panel.hidden = false;
    document.addEventListener('mousedown', onDocMouseDown, true);
    document.addEventListener('keydown', onDocKeydown);
    window.addEventListener('resize', positionPanel);
    window.addEventListener('scroll', positionPanel, true);
  };

  const onDocMouseDown = (ev: MouseEvent): void => {
    if (!(ev.target instanceof Node)) return;
    if (host.contains(ev.target)) return;
    if (panel.contains(ev.target)) return;
    close();
  };

  const onDocKeydown = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') close();
  };

  chip.addEventListener('click', () => (isOpen ? close() : open()));

  panel.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    const btn = target.closest<HTMLButtonElement>('[data-action]');
    if (!btn) return;
    void handleAction(btn);
  });

  async function handleAction(btn: HTMLButtonElement): Promise<void> {
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const cur = currentShow.value;
    try {
      if (action === 'switch' && id) {
        close();
        const show = await window.api.showLoad(id);
        loadShow(show);
      } else if (action === 'new') {
        close();
        const result = await openFormModal({
          title: 'New show',
          description:
            'Each show is its own scene + cast + dialogue. Switch between them anytime from the SHOW menu.',
          fields: [
            {
              id: 'name',
              label: 'Show name',
              type: 'text',
              required: true,
              placeholder: 'e.g. Pilot — Diner Argument',
            },
          ],
          submitLabel: 'Create',
        });
        if (result?.name) await createShow(result.name);
      } else if (action === 'mino-pilot') {
        close();
        await createMinoPilotShow();
        notify({ kind: 'info', message: 'Mino ve Uyuyan Yıldız pilotu hazır.' });
      } else if (action === 'rename') {
        close();
        const result = await openFormModal({
          title: 'Rename show',
          fields: [
            {
              id: 'name',
              label: 'Show name',
              type: 'text',
              required: true,
              defaultValue: cur.name,
            },
          ],
          submitLabel: 'Rename',
        });
        if (result?.name) renameCurrentShow(result.name);
      } else if (action === 'delete') {
        close();
        const result = await openFormModal({
          title: `Delete "${cur.name}"?`,
          description:
            'This removes the show, its dialogue, and any rendered audio. This cannot be undone. Type DELETE to confirm.',
          fields: [
            {
              id: 'confirm',
              label: 'Type DELETE to confirm',
              type: 'text',
              required: true,
              placeholder: 'DELETE',
            },
          ],
          submitLabel: 'Delete show',
        });
        if (result?.confirm?.trim().toUpperCase() === 'DELETE') {
          const name = cur.name;
          await deleteShow(cur.id);
          notify({ kind: 'info', message: `Deleted "${name}".` });
        }
      }
    } catch (err) {
      notifyError(err, 'Could not complete that action.');
    }
  }

  function renderPanel(): void {
    const cur = currentShow.value;
    const others = allShows.value
      .filter((s) => s.id !== cur.id)
      .sort((a, b) => b.updatedAt - a.updatedAt);

    panel.innerHTML = `
      <div class="show-picker-section show-picker-section-new">
        <button type="button" class="show-picker-new" data-action="new">
          <span class="show-picker-plus" aria-hidden="true">+</span>
          <span>New show</span>
        </button>
        <button type="button" class="show-picker-new" data-action="mino-pilot" title="Create the fairy-tale pilot with Mino, enchanted forest and prewritten Turkish narration">
          <span class="show-picker-plus" aria-hidden="true">★</span>
          <span>Mino pilotunu oluştur</span>
        </button>
      </div>
      <div class="show-picker-divider"></div>

      <div class="show-picker-section">
        <div class="caption show-picker-section-label">CURRENT</div>
        <div class="show-picker-current">
          <span class="show-picker-current-name">${escapeHtml(cur.name)}</span>
          <div class="show-picker-current-actions">
            <button type="button" class="show-picker-action" data-action="rename">Rename</button>
            <button type="button" class="show-picker-action show-picker-action-danger" data-action="delete">Delete</button>
          </div>
        </div>
      </div>

      ${
        others.length > 0
          ? `
        <div class="show-picker-divider"></div>
        <div class="show-picker-section">
          <div class="caption show-picker-section-label">SWITCH TO</div>
          <ul class="show-picker-list">
            ${others
              .map(
                (s) => `
                <li>
                  <button type="button" class="show-picker-item" data-action="switch" data-id="${escapeHtml(s.id)}">
                    <span class="show-picker-item-name">${escapeHtml(s.name)}</span>
                    <span class="caption show-picker-item-meta">${formatRelative(s.updatedAt)}</span>
                  </button>
                </li>`,
              )
              .join('')}
          </ul>
        </div>
      `
          : ''
      }
    `;
  }
}

function formatRelative(ts: number): string {
  const diffMs = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diffMs < min) return 'just now';
  if (diffMs < hr) return `${Math.floor(diffMs / min)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hr)}h ago`;
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
