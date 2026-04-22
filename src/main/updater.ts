import { app } from 'electron';

// GitHub repo to poll for new releases. Placeholder until publication —
// override via env var so users / forks don't have to edit code.
const REPO = process.env.CARTOON_STUDIO_UPDATE_REPO ?? 'Jellypod-Inc/cartoon-studio';

export type UpdateAvailable = {
  latest: string; // version string without leading 'v'
  current: string;
  url: string; // GitHub release page
  notes: string; // release body (may be empty)
};

// Polls GitHub Releases for the latest tag and compares against
// app.getVersion(). Returns { latest, url, ... } if newer, null otherwise.
//
// Fails safely: any error (network, 404, rate-limit, malformed JSON,
// missing fields, version-parse weirdness) returns null so the renderer
// behaves identically to "no update available". Never throws to the
// caller; never logs to user-visible surfaces.
export async function checkForUpdate(): Promise<UpdateAvailable | null> {
  // Skip in dev — running from source, not from a release.
  if (!app.isPackaged) return null;

  const current = app.getVersion();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(REPO)}/releases/latest`,
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'cartoon-studio-update-check',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: controller.signal,
      },
    ).catch(() => null);

    clearTimeout(timeout);

    // Network unreachable, DNS failure, abort, 4xx/5xx — bail.
    if (!res || !res.ok) return null;

    const data = (await res.json().catch(() => null)) as
      | { tag_name?: string; html_url?: string; body?: string }
      | null;
    if (!data || typeof data.tag_name !== 'string') return null;

    const latest = data.tag_name.replace(/^v/, '');
    if (!isNewer(latest, current)) return null;

    return {
      latest,
      current,
      url: data.html_url ?? `https://github.com/${REPO}/releases/latest`,
      notes: data.body ?? '',
    };
  } catch {
    // Anything else — JSON parse, fetch throws under unusual conditions,
    // unexpected response shape — pretend no update exists.
    return null;
  }
}

// Tiny version comparator. Accepts MAJOR.MINOR.PATCH plus an optional
// prerelease suffix (which we just lexicographically compare). Returns
// true iff `a` is strictly greater than `b`. On any parse weirdness,
// returns false so we err toward "no update available".
function isNewer(a: string, b: string): boolean {
  try {
    const [aBase = '', aPre = ''] = a.split('-', 2);
    const [bBase = '', bPre = ''] = b.split('-', 2);
    const aParts = aBase.split('.').map((x) => parseInt(x, 10));
    const bParts = bBase.split('.').map((x) => parseInt(x, 10));
    for (let i = 0; i < 3; i++) {
      const av = aParts[i] ?? 0;
      const bv = bParts[i] ?? 0;
      if (!Number.isFinite(av) || !Number.isFinite(bv)) return false;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    // Bases equal — a release without a prerelease tag beats one with.
    if (aPre === '' && bPre !== '') return true;
    if (aPre !== '' && bPre === '') return false;
    return aPre > bPre;
  } catch {
    return false;
  }
}
