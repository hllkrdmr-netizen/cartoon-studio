import { API_KEYS, type ApiKeyId } from '../shared/keys';

let panel: HTMLDivElement | null = null;

async function render(): Promise<void> {
  if (!panel) return;
  const status = await window.api.settingsGetAll();

  panel.innerHTML = `
    <div class="absolute inset-0 bg-black/60" data-close></div>
    <div class="relative w-[640px] max-h-[85vh] overflow-y-auto rounded-lg bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold">API keys</h2>
        <button data-close class="text-neutral-400 hover:text-neutral-100">&times;</button>
      </div>
      <p class="text-sm text-neutral-400 mb-4">
        Stored encrypted in the OS keychain via Electron <code class="text-xs">safeStorage</code>. Leave a field blank and save to remove.
      </p>
      <div class="space-y-4">
        ${API_KEYS.map(
          (k) => `
          <div class="rounded border border-neutral-800 p-3">
            <div class="flex items-center justify-between mb-1">
              <label class="font-medium" for="key-${k.id}">${k.label}</label>
              <span class="text-xs ${status[k.id] ? 'text-emerald-400' : 'text-neutral-500'}">
                ${status[k.id] ? '● set' : '○ not set'}
              </span>
            </div>
            <p class="text-xs text-neutral-400 mb-2">${k.purpose}</p>
            <div class="flex gap-2">
              <input
                id="key-${k.id}"
                data-key-id="${k.id}"
                type="password"
                placeholder="${status[k.id] ? '•••••••• (saved)' : 'paste key…'}"
                class="flex-1 rounded bg-neutral-800 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-neutral-600"
              />
              <button
                data-save="${k.id}"
                class="rounded bg-neutral-700 hover:bg-neutral-600 px-3 py-1 text-sm"
              >Save</button>
              <a
                href="${k.url}"
                target="_blank"
                rel="noreferrer"
                class="rounded border border-neutral-700 hover:border-neutral-500 px-3 py-1 text-sm flex items-center"
              >Get key</a>
            </div>
          </div>
        `,
        ).join('')}
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
      if (!input) return;
      await window.api.settingsSet(id, input.value);
      input.value = '';
      await render();
    });
  });
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
