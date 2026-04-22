// Editorial-style toast notifications.
//
// Replaces window.alert (which is ugly in Electron and disabled outright
// for window.prompt). Stacks bottom-right, fades in/out, auto-dismisses
// success/info, persists error/warning until the user closes them.
//
// For "missing API key" errors specifically, surfaces an "Open Settings"
// action button so the user goes straight to the fix.

type Kind = 'error' | 'warning' | 'success' | 'info';

type NotifyOptions = {
  kind: Kind;
  message: string;
  // Optional follow-up action — appears as a small primary button.
  action?: { label: string; onClick: () => void };
  // Auto-dismiss after this many ms. 0 = persist. Defaults: 0 for
  // error/warning, 4500 for success/info.
  duration?: number;
};

let containerEl: HTMLDivElement | null = null;
let openSettingsFn: (() => void) | null = null;

// Wired from renderer.ts at boot. Avoids a circular import between the
// notify module and the settings panel module.
export function registerOpenSettings(fn: () => void): void {
  openSettingsFn = fn;
}

function ensureContainer(): HTMLDivElement {
  if (containerEl && document.body.contains(containerEl)) return containerEl;
  containerEl = document.createElement('div');
  containerEl.className = 'ap-notify-container';
  document.body.appendChild(containerEl);
  return containerEl;
}

export function notify(opts: NotifyOptions): void {
  const container = ensureContainer();
  const el = document.createElement('div');
  el.className = `ap-notify ap-notify-${opts.kind}`;
  el.innerHTML = `
    <div class="ap-notify-head">
      <span class="caption ap-notify-kind"></span>
      <button class="ap-notify-close" aria-label="Dismiss">&times;</button>
    </div>
    <p class="ap-notify-msg"></p>
  `;
  el.querySelector<HTMLSpanElement>('.ap-notify-kind')!.textContent =
    labelFor(opts.kind);
  el.querySelector<HTMLParagraphElement>('.ap-notify-msg')!.textContent =
    opts.message;

  if (opts.action) {
    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn-primary ap-notify-action';
    actionBtn.textContent = opts.action.label;
    actionBtn.addEventListener('click', () => {
      opts.action!.onClick();
      remove();
    });
    el.appendChild(actionBtn);
  }

  el.querySelector<HTMLButtonElement>('.ap-notify-close')!.addEventListener(
    'click',
    () => remove(),
  );

  container.appendChild(el);
  // rAF before flipping the show class so the transition runs.
  requestAnimationFrame(() => el.classList.add('ap-notify-show'));

  const defaultDuration = opts.kind === 'error' || opts.kind === 'warning' ? 0 : 4500;
  const duration = opts.duration ?? defaultDuration;
  let timer: ReturnType<typeof setTimeout> | null = null;
  if (duration > 0) {
    timer = setTimeout(remove, duration);
  }

  // Pause auto-dismiss on hover so the user can read long messages.
  el.addEventListener('mouseenter', () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  });

  function remove(): void {
    if (timer) clearTimeout(timer);
    el.classList.remove('ap-notify-show');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // Belt + suspenders: if transitionend doesn't fire (e.g. element was
    // already removed from DOM), drop it after the animation duration.
    setTimeout(() => el.remove(), 240);
  }
}

// Convenience for catch blocks. Looks at the error text to decide whether
// to offer a Settings shortcut — so a missing-key error becomes a single
// click away from being fixed.
export function notifyError(err: unknown, fallbackMessage?: string): void {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw && raw !== 'cancelled' ? raw : fallbackMessage ?? 'Something went wrong.';
  const isKeyError = /(_API_KEY|api[_\s-]?key|set the key|missing.+key)/i.test(
    msg,
  );
  notify({
    kind: 'error',
    message: msg,
    action:
      isKeyError && openSettingsFn
        ? { label: 'Open Settings', onClick: openSettingsFn }
        : undefined,
  });
}

function labelFor(k: Kind): string {
  switch (k) {
    case 'error':
      return '✕ ERROR';
    case 'warning':
      return '⚠ WARNING';
    case 'success':
      return '● SAVED';
    case 'info':
      return '◯ INFO';
  }
}
