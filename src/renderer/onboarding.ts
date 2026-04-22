import {
  API_KEYS_INTELLIGENCE,
  API_KEYS_TTS,
  type ApiKeySpec,
} from '../shared/keys';
import {
  renderInsecureBanner,
  renderKeyRow,
  wireKeyRowHandlers,
} from './keyRow';

// First-run gate. Triggers when the user has zero API keys stored, since
// a fresh install needs at least OpenAI to do anything useful (dialogue
// generation + the default cast's TTS voices). Full parity with Settings:
// OpenAI required up top, everything else we support listed below so the
// user can pick favorites once instead of hunting through Settings later.

const REQUIRED_KEY: ApiKeySpec =
  API_KEYS_INTELLIGENCE.find((k) => k.id === 'OPENAI_API_KEY') ??
  API_KEYS_INTELLIGENCE[0];

// Everything except the one required key. Fal (intelligence) + all TTS
// providers, in the same order Settings shows them.
const OPTIONAL_KEYS: readonly ApiKeySpec[] = [
  ...API_KEYS_INTELLIGENCE.filter((k) => k.id !== REQUIRED_KEY.id),
  ...API_KEYS_TTS,
];

let panel: HTMLDivElement | null = null;

async function render(): Promise<void> {
  if (!panel) return;
  const [status, storage] = await Promise.all([
    window.api.settingsGetAll(),
    window.api.settingsStorageInfo(),
  ]);

  const hasRequired = Boolean(status[REQUIRED_KEY.id]);

  panel.innerHTML = `
    <div class="absolute inset-0" style="background: rgba(8,9,10,0.88); backdrop-filter: blur(4px);"></div>
    <div class="relative grain"
         style="width: 720px; max-width: 92vw; max-height: 92vh; overflow-y: auto; background: var(--color-surface); border: 1px solid var(--color-hairline); padding: 32px 32px 28px; box-shadow: 0 24px 80px -20px rgba(0,0,0,0.6);">
      <div class="caption mb-2">SC.00 · OPENING</div>
      <div style="padding-bottom: 16px; border-bottom: 1px solid var(--color-hairline);">
        <h2 class="font-display" style="font-size: 30px; font-weight: 500; letter-spacing: -0.015em; line-height: 1.1;">
          <span style="color: var(--color-text);">Welcome. Bring your </span><em style="color: var(--color-accent);">own keys</em><span style="color: var(--color-text);">.</span>
        </h2>
        <p style="font-size: 13.5px; color: var(--color-muted); margin-top: 10px; line-height: 1.55; max-width: 560px;">
          Cartoon Studio runs entirely on your machine with API keys you provide. Paste them once — they're encrypted via your OS keyring and never leave this computer. You can change them anytime from <strong style="color: var(--color-text); font-weight: 500;">Settings</strong>.
        </p>
      </div>

      ${renderInsecureBanner(storage)}

      <div style="padding-top: 20px; display: flex; flex-direction: column; gap: 14px;">
        <div class="flex items-center gap-3">
          <span class="caption">REQUIRED TO START</span>
          <span class="rule" style="flex: 1;"></span>
        </div>
        ${renderKeyRow({
          spec: REQUIRED_KEY,
          isSet: hasRequired,
          insecure: storage.insecure,
          requiredBadge: true,
        })}

        <div style="margin-top: 6px; padding-top: 20px; border-top: 1px solid var(--color-hairline); display: flex; flex-direction: column; gap: 14px;">
          <div class="flex items-center gap-3">
            <span class="caption">OPTIONAL · ADD ANYTIME</span>
            <span class="rule" style="flex: 1;"></span>
          </div>
          ${OPTIONAL_KEYS.map((spec) =>
            renderKeyRow({
              spec,
              isSet: Boolean(status[spec.id]),
              insecure: storage.insecure,
            }),
          ).join('')}
        </div>
      </div>

      <div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--color-hairline); display: flex; align-items: center; justify-content: space-between; gap: 12px;">
        <span class="caption" style="color: var(--color-muted);">
          ${hasRequired ? '● OPENAI SAVED · READY TO ENTER' : '○ ADD OPENAI KEY TO CONTINUE'}
        </span>
        <button data-enter class="btn-primary" ${hasRequired ? '' : 'disabled'}>
          Enter Studio →
        </button>
      </div>
    </div>
  `;

  wireKeyRowHandlers(panel, render);

  panel
    .querySelector<HTMLButtonElement>('[data-enter]')
    ?.addEventListener('click', () => {
      if (!hasRequired) return;
      dismiss();
    });
}

function dismiss(): void {
  if (!panel) return;
  panel.remove();
  panel = null;
}

/**
 * Show the first-run gate if the user has no API keys configured at all.
 * Resolves once the decision is made (immediately if no gate needed).
 */
export async function maybeShowOnboarding(): Promise<void> {
  const status = await window.api.settingsGetAll();
  const anyKeySet = Object.values(status).some(Boolean);
  if (anyKeySet) return;

  if (panel) return;
  panel = document.createElement('div');
  panel.className = 'fixed inset-0 z-50 flex items-center justify-center';
  document.body.appendChild(panel);
  await render();
}
