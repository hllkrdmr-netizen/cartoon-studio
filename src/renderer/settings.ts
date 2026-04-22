import {
  API_KEYS,
  API_KEYS_INTELLIGENCE,
  API_KEYS_TTS,
  type ApiKeyId,
  type ApiKeySpec,
} from '../shared/keys';
import { notify, notifyError } from './notify';

let panel: HTMLDivElement | null = null;

async function render(): Promise<void> {
  if (!panel) return;
  const [status, storage] = await Promise.all([
    window.api.settingsGetAll(),
    window.api.settingsStorageInfo(),
  ]);

  const insecureBanner = storage.insecure
    ? `<div class="ap-storage-warn">
         <span class="caption" style="color: var(--color-danger);">⚠ INSECURE STORAGE</span>
         <p style="font-size: 12.5px; color: var(--color-quiet); margin-top: 6px; line-height: 1.5;">
           No OS keyring detected (${escapeHtml(storage.backendLabel)}). Keys would be stored as plaintext on disk — saving is disabled.
           Install <code class="ap-mono">gnome-keyring</code> or <code class="ap-mono">kwallet</code>, or pass keys via environment variables instead.
         </p>
       </div>`
    : '';

  const keyRow = (k: ApiKeySpec) => `
          <div style="padding: 14px 16px; border: 1px solid var(--color-hairline); background: var(--color-ink);">
            <div class="flex items-center justify-between mb-1">
              <label for="key-${k.id}" style="font-family: var(--font-display); font-size: 17px; font-weight: 500; color: var(--color-text);">${escapeHtml(k.label)}</label>
              <span class="caption" style="color: ${status[k.id] ? 'var(--color-accent)' : 'var(--color-muted)'};">
                ${status[k.id] ? '● SET' : '○ NOT SET'}
              </span>
            </div>
            <p style="font-size: 12.5px; color: var(--color-muted); margin-bottom: 10px; line-height: 1.5;">${escapeHtml(k.purpose)}</p>
            <div class="flex gap-2">
              <input
                id="key-${k.id}"
                data-key-id="${k.id}"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="${status[k.id] ? '•••••••• (saved · paste new value to overwrite)' : 'paste key…'}"
                class="flex-1"
                ${storage.insecure ? 'disabled' : ''}
              />
              <button data-save="${k.id}" class="btn-primary" ${storage.insecure ? 'disabled' : ''}>Save</button>
              ${
                status[k.id]
                  ? `<button data-delete="${k.id}" class="btn-ghost" style="border-color: var(--color-danger); color: var(--color-danger);">Delete</button>`
                  : ''
              }
              <a href="${k.url}" target="_blank" rel="noreferrer" class="btn-ghost" style="text-decoration: none;">Get key ↗</a>
            </div>
          </div>
        `;

  panel.innerHTML = `
    <div class="absolute inset-0" data-close style="background: rgba(8,9,10,0.72); backdrop-filter: blur(2px);"></div>
    <div class="relative grain"
         style="width: 720px; max-width: 92vw; max-height: 88vh; overflow-y: auto; background: var(--color-surface); border: 1px solid var(--color-hairline); padding: 28px 28px 24px; box-shadow: 0 24px 80px -20px rgba(0,0,0,0.6);">
      <div class="caption mb-2">PREFERENCES · API KEYS</div>
      <div class="flex items-start justify-between gap-3" style="padding-bottom: 14px; border-bottom: 1px solid var(--color-hairline);">
        <div class="min-w-0">
          <h2 class="font-display" style="font-size: 26px; font-weight: 500; letter-spacing: -0.015em; line-height: 1.1;">
            <span style="color: var(--color-text);">Bring your </span><em style="color: var(--color-accent);">own keys</em><span style="color: var(--color-text);">.</span>
          </h2>
          <p style="font-size: 13px; color: var(--color-muted); margin-top: 8px; line-height: 1.5; max-width: 520px;">
            Pasted into the boxes below, encrypted via your OS keyring, written to a file only your user account can read. Never sent over the network. Never visible to the renderer process.
          </p>
        </div>
        <button data-close aria-label="Close"
                style="font-size: 18px; line-height: 1; color: var(--color-muted); background: transparent; border: 0; cursor: pointer; padding: 4px 6px;">&times;</button>
      </div>

      ${insecureBanner}

      <!-- Security info panel — what the user sees BEFORE they paste any key. -->
      <section style="margin-top: 18px; border: 1px solid var(--color-hairline); padding: 16px 18px; background: var(--color-ink);">
        <div class="flex items-center gap-3 mb-3">
          <span class="caption">SC.SEC · KEY VAULT</span>
          <span class="rule" style="flex: 1;"></span>
          <span class="caption" style="color: ${storage.insecure ? 'var(--color-danger)' : 'var(--color-accent)'};">
            ${storage.insecure ? '⚠ INSECURE' : '● ENCRYPTED'}
          </span>
        </div>
        <dl class="ap-vault-grid">
          <dt>Encryption</dt>
          <dd>
            ${escapeHtml(storage.backendLabel)}
            <span class="caption" style="margin-left: 8px;">${escapeHtml(storage.backend)}</span>
          </dd>

          <dt>Storage file</dt>
          <dd>
            <code class="ap-mono ap-mono-truncate" title="${escapeHtml(storage.path)}">${escapeHtml(storage.path)}</code>
          </dd>

          <dt>Network</dt>
          <dd>Keys never leave this machine. The renderer process never sees plaintext.</dd>
        </dl>
      </section>

      <div style="padding-top: 18px; display: flex; flex-direction: column; gap: 14px;">
        <div class="flex items-center gap-3">
          <span class="caption">DIALOGUE &amp; SCENES</span>
          <span class="rule" style="flex: 1;"></span>
        </div>
        ${API_KEYS_INTELLIGENCE.map((k) => keyRow(k)).join('')}

        <div style="margin-top: 4px; padding-top: 18px; border-top: 1px solid var(--color-hairline); display: flex; flex-direction: column; gap: 14px;">
          <div class="flex items-center gap-3">
            <span class="caption">TEXT-TO-SPEECH</span>
            <span class="rule" style="flex: 1;"></span>
          </div>
          ${API_KEYS_TTS.map((k) => keyRow(k)).join('')}
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeSettings),
  );
  panel.querySelectorAll<HTMLButtonElement>('[data-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.save as ApiKeyId;
      const input = panel!.querySelector<HTMLInputElement>(
        `[data-key-id="${id}"]`,
      );
      if (!input || !input.value.trim()) return;
      try {
        await window.api.settingsSet(id, input.value);
        input.value = '';
        notify({ kind: 'success', message: `${labelFor(id)} saved.` });
        await render();
      } catch (err) {
        notifyError(err, `Couldn't save ${labelFor(id)}.`);
      }
    });
  });
  panel.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delete as ApiKeyId;
      try {
        await window.api.settingsDelete(id);
        notify({ kind: 'info', message: `${labelFor(id)} removed.` });
        await render();
      } catch (err) {
        notifyError(err, `Couldn't remove ${labelFor(id)}.`);
      }
    });
  });
}

function labelFor(id: ApiKeyId): string {
  return API_KEYS.find((k) => k.id === id)?.label ?? id;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openSettings(): void {
  if (panel) return;
  panel = document.createElement('div');
  panel.className = 'fixed inset-0 z-50 flex items-center justify-center';
  document.body.appendChild(panel);
  void render();
}

export function closeSettings(): void {
  if (!panel) return;
  panel.remove();
  panel = null;
}
