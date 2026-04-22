// Update-available banner. Fires once on app start; if a newer release is
// found and the user hasn't already dismissed that exact version, slides
// in a slim editorial banner under the top header. Click "Download" to
// open the GitHub release in the browser; click × to dismiss this version
// (the next version will show again).
//
// All checking happens in the main process and fails safely there — this
// module just decides whether to show UI based on the result.

const DISMISSED_KEY = 'cartoonstudio.updateDismissed';

export async function setupUpdateBanner(): Promise<void> {
  let info: Awaited<ReturnType<typeof window.api.checkForUpdate>>;
  try {
    info = await window.api.checkForUpdate();
  } catch {
    return; // Belt-and-suspenders. Main side already swallows errors.
  }
  if (!info) return;

  // Don't pester the user with the same version they dismissed.
  const dismissed = safeGet(DISMISSED_KEY);
  if (dismissed === info.latest) return;

  showBanner(info);
}

function showBanner(info: {
  latest: string;
  current: string;
  url: string;
  notes: string;
}): void {
  const banner = document.createElement('div');
  banner.className = 'ap-update-banner';
  banner.innerHTML = `
    <div class="ap-update-inner">
      <span class="caption caption-accent">UPDATE · v${escapeHtml(info.latest)}</span>
      <span class="rule" style="width: 14px;"></span>
      <span class="ap-update-msg">A new cut of Cartoon Studio is available.</span>
      <span class="caption" style="margin-left: auto;">CURRENT v${escapeHtml(info.current)}</span>
      <a href="${escapeAttr(info.url)}" target="_blank" rel="noreferrer" class="btn-ghost">Download ↗</a>
      <button data-dismiss class="ap-update-x" aria-label="Dismiss">&times;</button>
    </div>
  `;

  // Insert directly under the top header so it spans the full width but
  // doesn't push the screen content reflow into a new layout pass each
  // time it appears (it's appended once, never re-rendered).
  const main = document.querySelector('main');
  const header = main?.querySelector('header');
  if (!main || !header) return;
  header.insertAdjacentElement('afterend', banner);

  banner
    .querySelector<HTMLButtonElement>('[data-dismiss]')!
    .addEventListener('click', () => {
      safeSet(DISMISSED_KEY, info.latest);
      banner.classList.add('ap-update-dismissed');
      // Wait for the slide-up transition before removing.
      banner.addEventListener('transitionend', () => banner.remove(), {
        once: true,
      });
      // Backstop in case transitionend doesn't fire.
      setTimeout(() => banner.remove(), 280);
    });
}

function safeGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode etc. — fine to drop */
  }
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
