// Auto-rig the mouth on a character SVG. Heuristic: find a small,
// wide-≫-tall, dark-filled path in the lower half of the figure, delete
// it, drop in a <g> with the 9 Preston Blair mouth shapes at its centroid.
//
// Approximate path bboxes are computed by extracting all numeric pairs
// from the `d` attribute. Recraft outputs are absolute paths so this
// trades precision for simplicity (worst case the centroid is off by a
// few units, well within the mouth-shape size).

const MOUTH_RIG_TEMPLATE = `<style>.mouth-group{opacity:0}.mouth-group.mouth-X{opacity:1}</style>
<g class="mouth-rig" transform="translate(__CX__ __CY__)">
<g class="mouth-wrap">
<g class="mouth-group mouth-X"><path d="M -75 0 L 75 0" fill="none" stroke="#0c0c0c" stroke-width="22" stroke-linecap="round"/></g>
<g class="mouth-group mouth-A"><path d="M -80 0 Q 0 18 80 0" fill="none" stroke="#0c0c0c" stroke-width="22" stroke-linecap="round"/></g>
<g class="mouth-group mouth-B"><ellipse cx="0" cy="0" rx="75" ry="12" fill="#3B1414"/></g>
<g class="mouth-group mouth-C"><ellipse cx="0" cy="8" rx="70" ry="38" fill="#3B1414" stroke="#0c0c0c" stroke-width="7"/></g>
<g class="mouth-group mouth-D"><ellipse cx="0" cy="0" rx="90" ry="60" fill="#3B1414" stroke="#0c0c0c" stroke-width="7"/></g>
<g class="mouth-group mouth-E"><ellipse cx="0" cy="0" rx="55" ry="40" fill="#3B1414" stroke="#0c0c0c" stroke-width="7"/></g>
<g class="mouth-group mouth-F"><ellipse cx="0" cy="0" rx="32" ry="36" fill="#3B1414" stroke="#0c0c0c" stroke-width="7"/></g>
<g class="mouth-group mouth-G"><path d="M -80 -8 L 80 -8 L 70 22 L -70 22 Z" fill="#3B1414" stroke="#0c0c0c" stroke-width="7"/></g>
<g class="mouth-group mouth-H"><ellipse cx="0" cy="0" rx="72" ry="42" fill="#3B1414" stroke="#0c0c0c" stroke-width="7"/><ellipse cx="0" cy="0" rx="32" ry="22" fill="#D47272"/></g>
</g>
</g>`;

function parseViewBox(svg: string): { w: number; h: number } | null {
  const m = svg.match(/viewBox="([^"]+)"/);
  if (!m) return null;
  const parts = m[1].split(/[ ,]+/).map(Number);
  if (parts.length < 4) return null;
  return { w: parts[2], h: parts[3] };
}

function pathBbox(d: string): { x: number; y: number; w: number; h: number } | null {
  const nums = d.match(/-?\d*\.?\d+/g);
  if (!nums || nums.length < 4) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = parseFloat(nums[i]);
    const y = parseFloat(nums[i + 1]);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function fillIsDark(fill: string): boolean {
  const m = fill.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i);
  if (!m) return /^#?(0|1|2)/i.test(fill);
  const [, r, g, b] = m;
  return parseInt(r) + parseInt(g) + parseInt(b) < 150;
}

type PathHit = {
  full: string;
  d: string;
  bbox: { x: number; y: number; w: number; h: number };
};

function findMouthPath(svg: string): PathHit | null {
  const vb = parseViewBox(svg) ?? { w: 2048, h: 2048 };
  // Walk every <path ...> tag; pick one matching the mouth heuristics.
  const pathRe = /<path[^>]*\bd="([^"]+)"[^>]*\bfill="([^"]+)"[^>]*\/?>(?:\s*<\/path>)?/g;
  let best: { hit: PathHit; score: number } | null = null;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(svg)) !== null) {
    const [full, d, fill] = m;
    if (!fillIsDark(fill)) continue;
    const bb = pathBbox(d);
    if (!bb) continue;
    const aspect = bb.w / Math.max(1, bb.h);
    if (aspect < 1.5) continue;
    if (bb.w > vb.w * 0.18) continue;
    if (bb.w < vb.w * 0.02) continue;
    const cy = bb.y + bb.h / 2;
    const cx = bb.x + bb.w / 2;
    if (cy < vb.h * 0.4) continue;
    // Score: prefer wider-than-tall, centered, in the lower-mid face.
    const horizCenter = Math.abs(cx - vb.w / 2) / vb.w;
    const targetY = vb.h * 0.6;
    const verticalDist = Math.abs(cy - targetY) / vb.h;
    const score = aspect - horizCenter * 4 - verticalDist * 4;
    if (!best || score > best.score) {
      best = { hit: { full, d, bbox: bb }, score };
    }
  }
  return best?.hit ?? null;
}

export function rigSvg(svg: string): { svg: string; rigged: boolean } {
  if (svg.includes('class="mouth-group')) {
    return { svg, rigged: true };
  }
  const hit = findMouthPath(svg);
  if (!hit) return { svg, rigged: false };
  const cx = (hit.bbox.x + hit.bbox.w / 2).toFixed(2);
  const cy = (hit.bbox.y + hit.bbox.h / 2).toFixed(2);
  const rig = MOUTH_RIG_TEMPLATE.replace('__CX__', cx).replace('__CY__', cy);
  // Replace the mouth path with the rig (keeps the rest of the SVG intact).
  const replaced = svg.replace(hit.full, rig);
  return { svg: replaced, rigged: true };
}

// Apply the mouth rig at a known location (typically from the vision LLM).
// `nx, ny, nw, nh` are normalized 0-1 fractions of the SVG viewBox.
//
// If a path inside that bbox looks like a mouth (dark fill or a wide-thin
// stroke), remove it so the rig isn't drawn on top of an existing static
// mouth. If nothing matches, just append the rig — the original mouth will
// show through but the character will still lip-sync.
export function applyMouthRigAt(
  svg: string,
  nx: number,
  ny: number,
  nw: number,
  nh: number,
): { svg: string; rigged: boolean; replaced: boolean } {
  if (svg.includes('class="mouth-group')) {
    return { svg, rigged: true, replaced: false };
  }
  const vb = parseViewBox(svg);
  if (!vb) return { svg, rigged: false, replaced: false };

  const cx = vb.w * (nx + nw / 2);
  const cy = vb.h * (ny + nh / 2);
  const minX = vb.w * nx;
  const maxX = vb.w * (nx + nw);
  const minY = vb.h * ny;
  const maxY = vb.h * (ny + nh);
  const diag = Math.hypot(vb.w, vb.h);

  // Match <path d="..." [...] fill="..."> in either attribute order. The
  // existing findMouthPath regex required fill after d; this one also
  // accepts fill="none" (stroke-only mouths).
  const pathRe =
    /<path\b[^>]*\bd="([^"]+)"[^>]*\/?>(?:\s*<\/path>)?/g;
  let best:
    | { full: string; score: number }
    | null = null;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(svg)) !== null) {
    const full = m[0];
    const d = m[1];
    const fillMatch = full.match(/\bfill="([^"]+)"/);
    const fill = fillMatch?.[1] ?? '';
    const bb = pathBbox(d);
    if (!bb) continue;
    const pcx = bb.x + bb.w / 2;
    const pcy = bb.y + bb.h / 2;
    if (pcx < minX || pcx > maxX || pcy < minY || pcy > maxY) continue;
    const dark = fillIsDark(fill) ? 2 : 0;
    const dist = Math.hypot(pcx - cx, pcy - cy);
    const closeness = 1 - dist / diag;
    const score = dark + closeness;
    if (!best || score > best.score) best = { full, score };
  }

  const rig = MOUTH_RIG_TEMPLATE.replace('__CX__', cx.toFixed(2)).replace(
    '__CY__',
    cy.toFixed(2),
  );
  if (best) {
    return {
      svg: svg.replace(best.full, rig),
      rigged: true,
      replaced: true,
    };
  }
  // No path inside the bbox — just append the rig as an overlay.
  return {
    svg: svg.replace('</svg>', `${rig}</svg>`),
    rigged: true,
    replaced: false,
  };
}

export function stripMagenta(svg: string): string {
  // Recraft sometimes emits a <rect ... fill="rgb(255,0,255)"> covering the
  // canvas. Drop any rect with that exact fill — leaves true foreground
  // whites and structural fills alone.
  return svg
    .replace(
      /<rect\b[^>]*fill="rgb\(\s*255\s*,\s*0\s*,\s*255\s*\)"[^>]*\/?>(?:\s*<\/rect>)?/g,
      '',
    )
    .replace(
      /<path\b[^>]*fill="rgb\(\s*255\s*,\s*0\s*,\s*255\s*\)"[^>]*\/?>(?:\s*<\/path>)?/g,
      '',
    );
}

export function normalizeViewBox(svg: string, target = 2432): string {
  const vb = parseViewBox(svg);
  if (!vb) return svg;
  if (Math.abs(vb.w - target) < 1 && Math.abs(vb.h - target) < 1) return svg;
  // Wrap the existing inner content in a <g transform="..."> that scales
  // and centers the original viewBox into the target.
  const scale = target / Math.max(vb.w, vb.h);
  const tx = (target - vb.w * scale) / 2;
  const ty = (target - vb.h * scale) / 2;
  const innerMatch = svg.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
  if (!innerMatch) return svg;
  const inner = innerMatch[1];
  const newInner = `<g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(4)})">${inner}</g>`;
  const newOpen = svg.match(/<svg[^>]*>/)![0]
    .replace(/viewBox="[^"]+"/, `viewBox="0 0 ${target} ${target}"`);
  return `${newOpen}${newInner}</svg>`;
}
