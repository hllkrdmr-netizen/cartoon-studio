import OpenAI from 'openai';
import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';

// Pure vision-LLM helpers, no Electron dependency. The app and the
// scripts/ rigging CLI both import from here so the prompt + schema
// stay in lockstep — change the prompt, both surfaces follow.

export type BBox = {
  /** All values normalized 0-1 against the source image. */
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MouthDetection = {
  found: boolean;
  mouth: BBox;
  /** Face bbox is used to scale the rig to the character's proportions. */
  face: BBox;
  /** 0-1; we trigger a verification render when this is shaky. */
  confidence: number;
};

export type RigVerification = {
  /** True iff the original mouth was completely replaced (no remnants). */
  clean: boolean;
  notes: string;
};

export const VISION_MODEL =
  process.env.CARTOON_STUDIO_VISION_MODEL ?? 'gpt-5.4';

// Reasoning effort for vision calls. Spatial bbox/landmark estimation
// genuinely benefits from chain-of-thought — the model can sanity-check
// "is this point on the face?" before answering. Medium is a reasonable
// trade-off between accuracy and latency (~3-6s per call vs ~1s for
// effort=none). Override via env if you want to dial it.
const VISION_REASONING_EFFORT =
  (process.env.CARTOON_STUDIO_VISION_REASONING_EFFORT as
    | 'none'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | undefined) ?? 'medium';

const LANDMARKS_SYSTEM = `You analyze cartoon character images and identify three facial landmarks: the LEFT eye center, the RIGHT eye center, and the mouth center. Return them as (x, y) POINTS — not bounding boxes.

Conventions:
  - "Left eye" = the eye on the LEFT SIDE OF THE IMAGE (the viewer's left), NOT the character's anatomical left.
  - All coordinates normalized 0-1 against the image (0,0 = top-left, 1,1 = bottom-right).
  - Eye center = the dark pupil center, or the geometric center of the eyeball if no pupil visible.
  - Mouth center = the geometric center of the mouth shape (lips/teeth/tongue/gap together).

Critical rule: mouth_center.y MUST be greater than the eye centers' y values. The mouth is below the eyes. If you cannot find a mouth below the eyes, set found=false — do NOT return a "mouth" coordinate that is above or level with the eyes.

If only one eye is visible (3/4 angle), set the other eye to the same coords as the visible one. If no face/eyes are visible at all, set found=false.

Also estimate mouth_width: how wide the mouth is as a fraction of the image width. For a thin closed-mouth line on a small face, this might be 0.03; for an open-mouthed close-up, it might be 0.20. Be honest — too small is better than too large.

Confidence: 0-1. Use < 0.7 when the character is unusual (non-human, sideways, etc.) or when landmarks are ambiguous.`;

const LANDMARKS_USER = `Identify the three landmarks: left_eye, right_eye, mouth_center. Return points (not bboxes) plus mouth_width and a confidence score. Remember: the mouth must be below the eyes, and "left" eye means image-left.`;

const MOUTH_IN_FACE_SYSTEM = `You analyze a tight crop of a single cartoon character's face. The image shows ONLY the head/face — no torso, no body. Identify the mouth precisely.

Return the mouth bbox: the smallest rectangle that contains the ENTIRE mouth region (lips, teeth, tongue, any open interior). Be tight on the edges but inclusive of all mouth components. The mouth might be a thin line, an oval, a dark gap, or an open shape. Pick the single most plausible mouth region — never the nose, never the eyes.`;

const MOUTH_IN_FACE_USER = `Find the mouth in this cartoon face crop. Return its bounding box as fractions of THIS image (0,0 = top-left, 1,1 = bottom-right) and your confidence (0-1). If no mouth is visible, set found=false.`;

const RIG_VERIFY_SYSTEM = `You compare two cartoon character images. Image A is the original character with its static drawn mouth. Image B is the same character after we attempted to replace the mouth with a thin horizontal black line (the closed-mouth state of a lip-sync rig).

Look ONLY at the mouth area. Decide whether image B shows a clean replacement (only the new horizontal line is visible, no leftover pieces of the original mouth) or whether parts of the original mouth — outlines, teeth, tongue, lips, fang shapes — are still visible alongside the line. Even small remnants count as not-clean.`;

const RIG_VERIFY_USER = `Image A is the original. Image B is after our attempted mouth replacement. Is the mouth area in B a clean replacement (clean=true) or are remnants of the original mouth still visible (clean=false)? In notes, briefly describe what you see in B's mouth area — what's still there, if anything.`;

const FaceLandmarksSchema = z.object({
  found: z.boolean(),
  left_eye: z.object({ x: z.number(), y: z.number() }),
  right_eye: z.object({ x: z.number(), y: z.number() }),
  mouth_center: z.object({ x: z.number(), y: z.number() }),
  mouth_width: z.number(),
  confidence: z.number(),
});

export type Point = { x: number; y: number };

export type FaceLandmarks = {
  found: boolean;
  /** All points normalized 0-1 against the source image. */
  leftEye: Point;
  rightEye: Point;
  mouthCenter: Point;
  /** Mouth width as a fraction of image width. */
  mouthWidth: number;
  confidence: number;
};

const RigVerificationSchema = z.object({
  clean: z.boolean(),
  notes: z.string(),
});

const RefinedMouthSchema = z.object({
  found: z.boolean(),
  mouth: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  confidence: z.number(),
});

export type RefinedMouth = {
  found: boolean;
  /** Bbox normalized 0-1 against the face-crop image. */
  mouth: BBox;
  confidence: number;
};

// Refined mouth detection on a face-only crop. Used as pass 2 of the
// vision pipeline — pass 1 finds the face, we re-render a cropped image
// of just the face, then this finds the mouth on that smaller image
// where the mouth occupies a much larger fraction (way easier task).
export async function detectMouthInFaceCrop(
  faceCropPng: Buffer,
  openai: OpenAI,
): Promise<RefinedMouth> {
  const completion = await openai.chat.completions.parse({
    model: VISION_MODEL,
    messages: [
      { role: 'system', content: MOUTH_IN_FACE_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: MOUTH_IN_FACE_USER },
          { type: 'image_url', image_url: { url: dataUrl(faceCropPng), detail: 'high' } },
        ],
      },
    ],
    response_format: zodResponseFormat(RefinedMouthSchema, 'refined_mouth'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    return {
      found: false,
      mouth: { x: 0, y: 0, width: 0, height: 0 },
      confidence: 0,
    };
  }
  return {
    found: Boolean(parsed.found),
    mouth: clampBox(parsed.mouth),
    confidence: clamp01(parsed.confidence),
  };
}

function dataUrl(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

export async function detectFaceLandmarks(
  pngBuffer: Buffer,
  openai: OpenAI,
): Promise<FaceLandmarks> {
  const completion = await openai.chat.completions.parse({
    model: VISION_MODEL,
    reasoning_effort: VISION_REASONING_EFFORT,
    messages: [
      { role: 'system', content: LANDMARKS_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: LANDMARKS_USER },
          { type: 'image_url', image_url: { url: dataUrl(pngBuffer), detail: 'high' } },
        ],
      },
    ],
    response_format: zodResponseFormat(FaceLandmarksSchema, 'face_landmarks'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    const refusal = completion.choices[0]?.message.refusal;
    throw new Error(
      refusal
        ? `Vision request refused: ${refusal}`
        : 'Vision request returned no parsed output.',
    );
  }

  return {
    found: Boolean(parsed.found),
    leftEye: clampPoint(parsed.left_eye),
    rightEye: clampPoint(parsed.right_eye),
    mouthCenter: clampPoint(parsed.mouth_center),
    mouthWidth: clamp01(parsed.mouth_width),
    confidence: clamp01(parsed.confidence),
  };
}

// Derive face + mouth bboxes from landmarks geometrically. Far more
// reliable than asking the LLM to draw bboxes directly:
//   - Eye span gives us face WIDTH (≈ 2.6× eye distance for cartoons).
//   - Eye-to-mouth vertical distance gives us face HEIGHT proportions.
//   - Mouth bbox is mouth_center ± mouth_width/2 (height = width × 0.35,
//     a typical mouth aspect for cartoon faces).
//   - Validation: mouth must be below eyes; eyes must be roughly level.
//
// Returns null when validation fails (LLM gave self-contradictory points).
export function landmarksToDetection(
  l: FaceLandmarks,
): MouthDetection | null {
  if (!l.found) return null;

  const eyeMidY = (l.leftEye.y + l.rightEye.y) / 2;
  const eyeMidX = (l.leftEye.x + l.rightEye.x) / 2;

  // Validation: mouth must be clearly below eyes.
  if (l.mouthCenter.y <= eyeMidY + 0.01) return null;

  // Validation: eyes must be roughly horizontal (within 15% of image height).
  if (Math.abs(l.leftEye.y - l.rightEye.y) > 0.15) return null;

  const eyeDist = Math.max(Math.abs(l.rightEye.x - l.leftEye.x), 0.04);
  const eyeToMouth = l.mouthCenter.y - eyeMidY;

  // Face width: ~2.6× eye-to-eye distance covers most cartoon proportions.
  // Floor at 0.18 so a sideways/3-quarter view (where one eye is hidden
  // and eye_dist collapses to ~0) doesn't collapse the face bbox.
  const faceWidth = Math.max(eyeDist * 2.6, 0.18);
  // Face vertical extent: from ~1× eye-to-mouth distance above the eye
  // line (room for forehead + hair) down to ~0.6× below the mouth (chin).
  const faceTop = Math.max(0, eyeMidY - eyeToMouth * 1.0);
  const faceBottom = Math.min(1, l.mouthCenter.y + eyeToMouth * 0.6);
  const face: BBox = {
    x: Math.max(0, eyeMidX - faceWidth / 2),
    y: faceTop,
    width: Math.min(faceWidth, 1),
    height: faceBottom - faceTop,
  };

  // Mouth bbox from center + width. Cartoon mouths are roughly 2.5-3:1
  // aspect; use 0.35 height-to-width to be generous on top/bottom for
  // open-mouth shapes.
  const mouthWidth = Math.max(l.mouthWidth, 0.02);
  const mouthHeight = mouthWidth * 0.35;
  const mouth: BBox = {
    x: Math.max(0, l.mouthCenter.x - mouthWidth / 2),
    y: Math.max(0, l.mouthCenter.y - mouthHeight / 2),
    width: Math.min(mouthWidth, 1),
    height: Math.min(mouthHeight, 1),
  };

  return { found: true, mouth, face, confidence: l.confidence };
}

export async function verifyRig(
  originalPng: Buffer,
  riggedPng: Buffer,
  openai: OpenAI,
): Promise<RigVerification> {
  const completion = await openai.chat.completions.parse({
    model: VISION_MODEL,
    // Verification is a yes/no comparison — light reasoning is enough.
    reasoning_effort: 'low',
    messages: [
      { role: 'system', content: RIG_VERIFY_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Image A (original):' },
          { type: 'image_url', image_url: { url: dataUrl(originalPng), detail: 'high' } },
          { type: 'text', text: 'Image B (after mouth replacement):' },
          { type: 'image_url', image_url: { url: dataUrl(riggedPng), detail: 'high' } },
          { type: 'text', text: RIG_VERIFY_USER },
        ],
      },
    ],
    response_format: zodResponseFormat(RigVerificationSchema, 'rig_verification'),
  });

  const parsed = completion.choices[0]?.message.parsed;
  if (!parsed) {
    return {
      clean: false,
      notes: 'verification call returned no parsed output',
    };
  }
  return { clean: Boolean(parsed.clean), notes: parsed.notes };
}

function clampBox(b: { x: number; y: number; width: number; height: number }): BBox {
  return {
    x: clamp01(b.x),
    y: clamp01(b.y),
    width: clamp01(b.width),
    height: clamp01(b.height),
  };
}

function clampPoint(p: { x: number; y: number }): Point {
  return { x: clamp01(p.x), y: clamp01(p.y) };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

