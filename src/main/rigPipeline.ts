import OpenAI from 'openai';
import {
  detectFaceLandmarks,
  detectMouthInFaceCrop,
  landmarksToDetection,
  verifyRig,
  type MouthDetection,
  type FaceLandmarks,
  type BBox,
} from './llm-core';
import {
  replaceMouthRegion,
  cropSvgToBbox,
  type ReplaceMouthResult,
} from './svgRig';

// Shared vision-rigging pipeline used by:
//   - recraft.ts (post-generation, when the heuristic missed)
//   - ipc/index.ts upload flow (after the heuristic missed)
//   - scripts/rig-svg.ts (CLI tool)
//
// Landmark-first detection from first principles: LLMs are bad at
// drawing tight bounding boxes around small features but good at
// identifying distinctive points (the eyes are huge on most cartoon
// characters). So we ask for POINTS — left_eye, right_eye, mouth_center —
// and DERIVE the face/mouth bboxes from those landmarks geometrically.
// This avoids the failure mode where the LLM returns a face bbox that
// extends into the body and a "mouth" placed in the chest area.
//
// Pipeline:
//   pass 1 (full image)  → 3 landmark points + mouth_width
//   landmarks → face & mouth bboxes (geometric derivation)
//   re-render SVG cropped to derived face → small focused image
//   pass 2 (face crop)   → precise mouth bbox refinement
//   convert back to full-image coords → replace + scale rig + verify
//
// Validation at every stage:
//   - landmarks: mouth must be below eyes; eyes must be roughly level
//   - refinement: refined mouth center must fall inside the face bbox
//   - any failed validation falls back to the pre-validation result
//
// Caller supplies the rasterizer (the app uses an offscreen Electron
// BrowserWindow; the script uses rsvg-convert) and the OpenAI client.

export type RigPipelineDeps = {
  /** Initial raster of the un-rigged SVG. */
  initialRaster: Buffer;
  /** Re-rasterize an SVG (used for the face crop AND for verification).
   *  Required for the new two-pass pipeline; without it we can't crop. */
  rerasterize: (svg: string) => Promise<Buffer>;
  openai: OpenAI;
};

export type RigPipelineOptions = {
  /** Verify-and-retry when the LLM's confidence is below this. Default 0.7. */
  confidenceThreshold?: number;
  /** Cap on retries when verification reports remnants. Default 1. */
  maxRetries?: number;
  /** Skip pass-2 refinement (saves one LLM call). Default false — refinement
   *  is the main robustness win and should only be skipped for testing. */
  skipRefinement?: boolean;
};

export type RigPipelineResult = {
  svg: string;
  status: 'rigged' | 'failed';
  /** Diagnostic for callers that want to log/show a warning. */
  reason?: string;
  landmarks?: FaceLandmarks;
  detection?: MouthDetection;
  /** Whether pass-2 refinement ran and was used. */
  refined?: boolean;
  removedPaths?: number;
  scale?: number;
  attempts?: number;
  verified?: boolean;
  verificationNotes?: string;
};

export async function rigCharacterWithVision(
  svg: string,
  deps: RigPipelineDeps,
  options?: RigPipelineOptions,
): Promise<RigPipelineResult> {
  const confidenceThreshold = options?.confidenceThreshold ?? 0.7;
  const maxRetries = options?.maxRetries ?? 1;

  // PASS 1: full-image detection of facial landmarks (eyes + mouth center).
  const landmarks = await detectFaceLandmarks(deps.initialRaster, deps.openai);
  const detection = landmarksToDetection(landmarks);
  if (!detection) {
    return {
      svg,
      status: 'failed',
      reason: !landmarks.found
        ? 'vision LLM did not locate a face on this character'
        : 'landmark validation failed (mouth above eyes, or eyes not horizontal)',
      landmarks,
    };
  }

  let mouth: BBox = detection.mouth;
  let refined = false;

  // PASS 2: re-render cropped to the face and locate the mouth precisely.
  // This is the main robustness win — the LLM gets a focused face image
  // where the mouth is a much larger fraction of the pixels. It can't be
  // confused by body parts, dark spots on clothing, or limb shapes that
  // might look mouth-like in the full image.
  if (!options?.skipRefinement) {
    try {
      const { svg: croppedSvg, cropBbox } = cropSvgToBbox(svg, detection.face);
      const facePng = await deps.rerasterize(croppedSvg);
      const refinedMouth = await detectMouthInFaceCrop(facePng, deps.openai);
      if (
        refinedMouth.found &&
        refinedMouth.mouth.width > 0 &&
        refinedMouth.mouth.height > 0
      ) {
        // Convert from face-crop coords back to full-image coords using
        // the actual crop region (which was padded around the face).
        const candidate: BBox = {
          x: cropBbox.x + cropBbox.width * refinedMouth.mouth.x,
          y: cropBbox.y + cropBbox.height * refinedMouth.mouth.y,
          width: cropBbox.width * refinedMouth.mouth.width,
          height: cropBbox.height * refinedMouth.mouth.height,
        };
        // Validate: the refined mouth's center must lie inside the face
        // bbox. If the LLM contradicted itself (mouth somewhere weird),
        // discard the refinement and stick with the pass-1 result.
        if (bboxCenterInside(candidate, detection.face)) {
          mouth = candidate;
          refined = true;
        }
      }
    } catch {
      // Refinement failed (rasterize threw, LLM threw, etc.) — keep pass-1
      // mouth; the rig still goes on, just without the precision boost.
    }
  }

  // Final-validate the chosen mouth: it must be inside the face. If pass-1
  // also gave us a mouth outside the face (rare but possible), snap it to
  // the face center with a sensible default size based on face dimensions.
  if (!bboxCenterInside(mouth, detection.face)) {
    mouth = {
      x: detection.face.x + detection.face.width * 0.30,
      y: detection.face.y + detection.face.height * 0.65,
      width: detection.face.width * 0.40,
      height: detection.face.height * 0.15,
    };
  }

  let attempts = 0;
  let result: ReplaceMouthResult = replaceMouthRegion(svg, mouth);
  attempts++;

  // Verify when confidence is shaky OR removal touched no paths (the rig
  // is going on as a pure overlay; we want to know if the original mouth
  // still shows through). Skip verification when refinement boosted us
  // out of the shaky zone — refined detection is high-trust by design.
  const effectiveConfidence = refined
    ? Math.max(detection.confidence, 0.9)
    : detection.confidence;
  const shouldVerify =
    effectiveConfidence < confidenceThreshold || result.removedCount === 0;

  if (!shouldVerify) {
    return {
      svg: result.svg,
      status: 'rigged',
      landmarks,
      detection,
      refined,
      removedPaths: result.removedCount,
      scale: result.scale,
      attempts,
      verified: false,
    };
  }

  // Verify-and-retry loop. Each retry expands the mouth bbox and re-runs
  // replacement on the ORIGINAL svg (not the partially-rigged one) so
  // each attempt starts from a clean slate.
  let lastNotes = '';
  for (let retry = 0; retry <= maxRetries; retry++) {
    const reraster = await deps.rerasterize(result.svg);
    const verification = await verifyRig(deps.initialRaster, reraster, deps.openai);
    lastNotes = verification.notes;
    if (verification.clean) {
      return {
        svg: result.svg,
        status: 'rigged',
        landmarks,
        detection,
        refined,
        removedPaths: result.removedCount,
        scale: result.scale,
        attempts,
        verified: true,
        verificationNotes: verification.notes,
      };
    }
    if (retry === maxRetries) break;
    mouth = expandBbox(mouth, 1.5);
    result = replaceMouthRegion(svg, mouth);
    attempts++;
  }

  // Out of retries. Return whatever the last attempt produced — a noisy
  // rig still beats no rig (the character lip-syncs with some bleed).
  return {
    svg: result.svg,
    status: 'rigged',
    reason: `verification still reported remnants after ${attempts} attempt(s); shipping anyway`,
    landmarks,
    detection,
    refined,
    removedPaths: result.removedCount,
    scale: result.scale,
    attempts,
    verified: false,
    verificationNotes: lastNotes,
  };
}

function bboxCenterInside(inner: BBox, outer: BBox): boolean {
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return (
    cx >= outer.x &&
    cx <= outer.x + outer.width &&
    cy >= outer.y &&
    cy <= outer.y + outer.height
  );
}

function expandBbox(b: BBox, factor: number): BBox {
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  const newW = Math.min(1, b.width * factor);
  const newH = Math.min(1, b.height * factor);
  return {
    x: Math.max(0, cx - newW / 2),
    y: Math.max(0, cy - newH / 2),
    width: newW,
    height: newH,
  };
}
