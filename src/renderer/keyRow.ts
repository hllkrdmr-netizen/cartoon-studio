import { API_KEYS, type ApiKeyId, type ApiKeySpec } from '../shared/keys';
import { notify, notifyError } from './notify';

// Shared bits for rendering and wiring API-key rows. Used by the Settings
// modal and the first-run Onboarding gate — both surfaces show the same
// provider list with identical save/delete behavior, so the markup and
// handlers live here instead of drifting between files.

type StorageInfo = Awaited<ReturnType<typeof window.api.settingsStorageInfo>>;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function labelFor(id: ApiKeyId): string {
  return API_KEYS.find((k) => k.id === id)?.label ?? id;
}

export function renderInsecureBanner(storage: StorageInfo): string {
  if (!storage.insecure) return '';
  return `<div class="ap-storage-warn">
      <span class="caption" style="color: var(--color-danger);">⚠ INSECURE STORAGE</span>
      <p style="font-size: 12.5px; color: var(--color-quiet); margin-top: 6px; line-height: 1.5;">
        No OS keyring detected (${escapeHtml(storage.backendLabel)}). Keys would be stored as plaintext on disk — saving is disabled.
        Install <code class="ap-mono">gnome-keyring</code> or <code class="ap-mono">kwallet</code>, or pass keys via environment variables instead.
      </p>
    </div>`;
}

export type KeyRowOptions = {
  spec: ApiKeySpec;
  isSet: boolean;
  insecure: boolean;
  /** Show a small REQUIRED pill next to the label (onboarding uses this). */
  requiredBadge?: boolean;
  /** Render a Delete button when the key is already set. */
  showDelete?: boolean;
};

export function renderKeyRow({
  spec,
  isSet,
  insecure,
  requiredBadge,
  showDelete,
}: KeyRowOptions): string {
  const badge = requiredBadge
    ? ' <span class="caption" style="color: var(--color-accent); margin-left: 6px;">REQUIRED</span>'
    : '';
  const deleteBtn =
    showDelete && isSet
      ? `<button data-delete="${spec.id}" class="btn-ghost" style="border-color: var(--color-danger); color: var(--color-danger);">Delete</button>`
      : '';
  return `
    <div style="padding: 14px 16px; border: 1px solid var(--color-hairline); background: var(--color-ink);">
      <div class="flex items-center justify-between mb-1">
        <label for="key-${spec.id}" style="font-family: var(--font-display); font-size: 17px; font-weight: 500; color: var(--color-text);">
          ${escapeHtml(spec.label)}${badge}
        </label>
        <span class="caption" style="color: ${isSet ? 'var(--color-accent)' : 'var(--color-muted)'};">
          ${isSet ? '● SET' : '○ NOT SET'}
        </span>
      </div>
      <p style="font-size: 12.5px; color: var(--color-muted); margin-bottom: 10px; line-height: 1.5;">${escapeHtml(spec.purpose)}</p>
      <div class="flex gap-2">
        <input
          id="key-${spec.id}"
          data-key-id="${spec.id}"
          type="password"
          autocomplete="off"
          spellcheck="false"
          placeholder="${isSet ? '•••••••• (saved · paste new value to overwrite)' : 'paste key…'}"
          class="flex-1"
          ${insecure ? 'disabled' : ''}
        />
        <button data-save="${spec.id}" class="btn-primary" ${insecure ? 'disabled' : ''}>Save</button>
        ${deleteBtn}
        <a href="${spec.url}" target="_blank" rel="noreferrer" class="btn-ghost" style="text-decoration: none;">Get key ↗</a>
      </div>
    </div>
  `;
}

/**
 * Wire click handlers for every `[data-save]` and `[data-delete]` button
 * inside `container`. Reads the input by `[data-key-id="..."]`, calls the
 * settings IPC, shows a toast, and invokes `onChange` so the caller can
 * re-render the panel with fresh status.
 */
export function wireKeyRowHandlers(
  container: ParentNode,
  onChange: () => void | Promise<void>,
): void {
  container.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.save as ApiKeyId;
      const input = container.querySelector<HTMLInputElement>(
        `[data-key-id="${id}"]`,
      );
      if (!input || !input.value.trim()) return;
      try {
        await window.api.settingsSet(id, input.value);
        input.value = '';
        notify({ kind: 'success', message: `${labelFor(id)} saved.` });
        await onChange();
      } catch (err) {
        notifyError(err, `Couldn't save ${labelFor(id)}.`);
      }
    });
  });

  container
    .querySelectorAll<HTMLButtonElement>('[data-delete]')
    .forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.delete as ApiKeyId;
        try {
          await window.api.settingsDelete(id);
          notify({ kind: 'info', message: `${labelFor(id)} removed.` });
          await onChange();
        } catch (err) {
          notifyError(err, `Couldn't remove ${labelFor(id)}.`);
        }
      });
    });
}
