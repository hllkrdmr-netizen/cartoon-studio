import {
  API_KEYS_INTELLIGENCE,
  API_KEYS_TTS,
  type ApiKeySpec,
} from '../shared/keys';
import {
  escapeHtml,
  renderInsecureBanner,
  renderKeyRow,
  wireKeyRowHandlers,
} from './keyRow';

let panel: HTMLDivElement | null = null;

async function render(): Promise<void> {
  if (!panel) return;
  const [status, storage] = await Promise.all([
    window.api.settingsGetAll(),
    window.api.settingsStorageInfo(),
  ]);

  const section = (keys: readonly ApiKeySpec[]) =>
    keys
      .map((spec) =>
        renderKeyRow({
          spec,
          isSet: Boolean(status[spec.id]),
          insecure: storage.insecure,
          showDelete: true,
        }),
      )
      .join('');

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

      ${renderInsecureBanner(storage)}

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
        ${section(API_KEYS_INTELLIGENCE)}

        <div style="margin-top: 4px; padding-top: 18px; border-top: 1px solid var(--color-hairline); display: flex; flex-direction: column; gap: 14px;">
          <div class="flex items-center gap-3">
            <span class="caption">TEXT-TO-SPEECH</span>
            <span class="rule" style="flex: 1;"></span>
          </div>
          ${section(API_KEYS_TTS)}
        </div>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-close]').forEach((el) =>
    el.addEventListener('click', closeSettings),
  );
  wireKeyRowHandlers(panel, render);
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
