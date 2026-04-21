export function svgToDataUri(svg: string): string {
  // Encode into a data: URL safely. encodeURIComponent handles UTF-8.
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function uid(prefix = ''): string {
  const r =
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  return prefix ? `${prefix}_${r.slice(0, 8)}` : r;
}
