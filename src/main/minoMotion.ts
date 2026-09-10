import type { Cue } from './cues';

/**
 * Deterministic motion plan for the Mino pilot.
 *
 * This does not use requestAnimationFrame or wall-clock time. The generated
 * statements are intended to be added to the same paused GSAP timeline that
 * HyperFrames seeks frame-by-frame, so preview and final MP4 stay in sync.
 */
export type MinoMotionBeat = {
  at: number;
  duration: number;
  action:
    | 'idle'
    | 'look-up'
    | 'notice'
    | 'bend-down'
    | 'hold-star'
    | 'walk'
    | 'sad'
    | 'wish'
    | 'wave';
};

export const MINO_PILOT_BEATS: readonly MinoMotionBeat[] = [
  { at: 0, duration: 8, action: 'look-up' },
  { at: 8, duration: 8, action: 'notice' },
  { at: 16, duration: 8, action: 'bend-down' },
  { at: 24, duration: 10, action: 'hold-star' },
  { at: 34, duration: 9, action: 'walk' },
  { at: 43, duration: 9, action: 'sad' },
  { at: 52, duration: 8, action: 'wish' },
  { at: 60, duration: 10, action: 'wave' },
] as const;

export function buildMinoTimelineJs(characterId: string, totalDuration: number): string {
  const rig = `#${characterId}-rig`;
  const slot = `#slot-${characterId}`;
  const q = (part: string) => `${rig} ${part}`;

  const lines: string[] = [];
  lines.push(`// Mino character motion — deterministic GSAP timeline.`);
  lines.push(`var minoSlot = ${JSON.stringify(slot)};`);
  lines.push(`var minoRig = ${JSON.stringify(rig)};`);
  lines.push(`if (document.querySelector(minoRig)) {`);
  lines.push(`  gsap.set(${JSON.stringify(q('#head'))}, { transformOrigin: '50% 75%' });`);
  lines.push(`  gsap.set(${JSON.stringify(q('#ear-left'))}, { transformOrigin: '70% 90%' });`);
  lines.push(`  gsap.set(${JSON.stringify(q('#ear-right'))}, { transformOrigin: '30% 90%' });`);
  lines.push(`  gsap.set(${JSON.stringify(q('#arm-left'))}, { transformOrigin: '60% 15%' });`);
  lines.push(`  gsap.set(${JSON.stringify(q('#arm-right'))}, { transformOrigin: '40% 15%' });`);
  lines.push(`  gsap.set(${JSON.stringify(q('#eye-left'))}, { transformOrigin: '50% 50%' });`);
  lines.push(`  gsap.set(${JSON.stringify(q('#eye-right'))}, { transformOrigin: '50% 50%' });`);

  // Gentle idle motion, repeated with finite deterministic beats.
  for (let t = 0; t < totalDuration; t += 2.8) {
    lines.push(`  tl.to(${JSON.stringify(slot)}, { y: -5, duration: 1.4, ease: 'sine.inOut' }, ${t.toFixed(2)});`);
    lines.push(`  tl.to(${JSON.stringify(slot)}, { y: 0, duration: 1.4, ease: 'sine.inOut' }, ${(t + 1.4).toFixed(2)});`);
  }

  // Natural blinks. Finite beats make HyperFrames seek deterministic.
  for (let t = 3.6; t < totalDuration; t += 4.7) {
    lines.push(`  tl.to([${JSON.stringify(q('#eye-left'))}, ${JSON.stringify(q('#eye-right'))}], { scaleY: 0.08, duration: 0.07 }, ${t.toFixed(2)});`);
    lines.push(`  tl.to([${JSON.stringify(q('#eye-left'))}, ${JSON.stringify(q('#eye-right'))}], { scaleY: 1, duration: 0.09 }, ${(t + 0.08).toFixed(2)});`);
  }

  for (const beat of MINO_PILOT_BEATS) {
    const t = beat.at;
    switch (beat.action) {
      case 'look-up':
        lines.push(`  tl.to(${JSON.stringify(q('#head'))}, { rotation: -6, y: -8, duration: 0.8, ease: 'power2.out' }, ${t + 1});`);
        lines.push(`  tl.to(${JSON.stringify(q('#ear-left'))}, { rotation: -7, duration: 0.8 }, ${t + 1});`);
        lines.push(`  tl.to(${JSON.stringify(q('#ear-right'))}, { rotation: 7, duration: 0.8 }, ${t + 1});`);
        break;
      case 'notice':
        lines.push(`  tl.to(${JSON.stringify(q('#head'))}, { rotation: 7, y: 8, duration: 0.5, ease: 'power2.out' }, ${t + 0.4});`);
        lines.push(`  tl.to([${JSON.stringify(q('#eye-left'))}, ${JSON.stringify(q('#eye-right'))}], { scale: 1.1, duration: 0.25, yoyo: true, repeat: 1 }, ${t + 0.8});`);
        break;
      case 'bend-down':
        lines.push(`  tl.to(${JSON.stringify(slot)}, { y: 36, scaleY: 0.93, duration: 0.65, ease: 'power2.inOut' }, ${t + 0.4});`);
        lines.push(`  tl.to(${JSON.stringify(q('#head'))}, { rotation: 9, y: 20, duration: 0.65 }, ${t + 0.4});`);
        break;
      case 'hold-star':
        lines.push(`  tl.to([${JSON.stringify(q('#arm-left'))}, ${JSON.stringify(q('#arm-right'))}], { rotation: 0, x: 0, y: -28, duration: 0.55, ease: 'back.out(1.3)' }, ${t + 0.5});`);
        lines.push(`  tl.to(${JSON.stringify(q('#head'))}, { rotation: 0, y: 0, duration: 0.45 }, ${t + 0.7});`);
        break;
      case 'walk':
        for (let step = 0; step < 8; step++) {
          const st = t + step * 0.9;
          const dir = step % 2 === 0 ? 1 : -1;
          lines.push(`  tl.to(${JSON.stringify(slot)}, { x: ${dir * 10}, y: -10, rotation: ${dir * 1.3}, duration: 0.22, ease: 'sine.out' }, ${st.toFixed(2)});`);
          lines.push(`  tl.to(${JSON.stringify(slot)}, { x: 0, y: 0, rotation: 0, duration: 0.23, ease: 'sine.in' }, ${(st + 0.22).toFixed(2)});`);
          lines.push(`  tl.to(${JSON.stringify(q('#ear-left'))}, { rotation: ${-dir * 8}, duration: 0.22 }, ${st.toFixed(2)});`);
          lines.push(`  tl.to(${JSON.stringify(q('#ear-right'))}, { rotation: ${dir * 8}, duration: 0.22 }, ${st.toFixed(2)});`);
        }
        break;
      case 'sad':
        lines.push(`  tl.to(${JSON.stringify(q('#head'))}, { y: 22, rotation: 3, duration: 0.8, ease: 'power2.out' }, ${t + 0.5});`);
        lines.push(`  tl.to(${JSON.stringify(q('#ear-left'))}, { rotation: 11, y: 12, duration: 0.8 }, ${t + 0.5});`);
        lines.push(`  tl.to(${JSON.stringify(q('#ear-right'))}, { rotation: -11, y: 12, duration: 0.8 }, ${t + 0.5});`);
        break;
      case 'wish':
        lines.push(`  tl.to([${JSON.stringify(q('#arm-left'))}, ${JSON.stringify(q('#arm-right'))}], { y: -44, duration: 0.5, ease: 'power2.out' }, ${t + 0.4});`);
        lines.push(`  tl.to([${JSON.stringify(q('#eye-left'))}, ${JSON.stringify(q('#eye-right'))}], { scaleY: 0.08, duration: 0.2 }, ${t + 0.5});`);
        lines.push(`  tl.to([${JSON.stringify(q('#eye-left'))}, ${JSON.stringify(q('#eye-right'))}], { scaleY: 1, duration: 0.2 }, ${t + 3.2});`);
        lines.push(`  tl.to([${JSON.stringify(q('#ear-left'))}, ${JSON.stringify(q('#ear-right'))}], { rotation: 0, y: -8, duration: 0.5, ease: 'back.out(1.5)' }, ${t + 3.1});`);
        break;
      case 'wave':
        lines.push(`  tl.to(${JSON.stringify(q('#arm-right'))}, { rotation: -42, y: -38, duration: 0.4, ease: 'back.out(1.4)' }, ${t + 0.6});`);
        for (let w = 0; w < 5; w++) {
          const wt = t + 1.1 + w * 0.55;
          lines.push(`  tl.to(${JSON.stringify(q('#arm-right'))}, { rotation: ${w % 2 === 0 ? -58 : -28}, duration: 0.26, ease: 'sine.inOut' }, ${wt.toFixed(2)});`);
        }
        lines.push(`  tl.to(${JSON.stringify(q('#arm-right'))}, { rotation: 0, y: 0, duration: 0.45 }, ${t + 4});`);
        break;
      default:
        break;
    }
  }

  lines.push(`}`);
  return lines.join('\n');
}

// Keep Cue imported so this module remains near the lip-sync layer and can be
// extended later with phoneme-reactive gestures without changing its API.
void (0 as unknown as Cue | number);
