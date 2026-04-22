import { fal } from '@fal-ai/client';
import { applyKeysToEnv } from './env';
import { settings } from './settings';
import {
  rigSvg,
  stripMagenta,
  stripBackgroundFill,
  normalizeViewBox,
} from './svgRig';
import { renderSvgToPng } from './renderSvg';
import { buildOpenAIClient } from './llm';
import { rigCharacterWithVision } from './rigPipeline';

let configured = false;
function configure(): void {
  applyKeysToEnv();
  const key = settings.get('FAL_API_KEY');
  if (!key) {
    throw new Error('FAL_API_KEY is not set. Add it in Settings to generate.');
  }
  if (!configured) {
    fal.config({ credentials: key });
    configured = true;
  }
}

const STYLE_HINT =
  'flat South Park style construction-paper cutout, thick black outlines, no gradients, no shading, simple solid colors';

export async function generateCharacter(prompt: string): Promise<string> {
  configure();
  const fullPrompt = `${prompt}. ${STYLE_HINT}. Single character, full body, facing forward, mouth visible.`;
  const r = (await fal.subscribe('fal-ai/recraft/v4/text-to-vector', {
    input: {
      prompt: fullPrompt,
      style: 'vector_illustration',
      // Magenta plate so we can reliably strip the background later.
      // (See spec gotcha: any other color and you can't distinguish bg
      // whites from foreground whites like skin/sclera.)
      background_color: { r: 255, g: 0, b: 255 },
    },
  })) as { data: { images: Array<{ url: string; content?: string }> } };

  const url = r.data.images?.[0]?.url;
  if (!url) throw new Error('Recraft returned no image.');
  const svg = await (await fetch(url)).text();
  // Two-stage background strip: first the magenta plate (when Recraft
  // honored our background_color hint), then any remaining full-canvas
  // fill (when it didn't — usually a white rect on top of the magenta).
  const noBg = stripBackgroundFill(stripMagenta(svg));
  const normalized = normalizeViewBox(noBg);
  const heur = rigSvg(normalized);
  if (heur.rigged) return heur.svg;

  // Heuristic missed (non-human face, unusual mouth styling, etc.).
  // Fall back to the shared vision pipeline: rasterize → GPT-4o detection
  // → geometric removal of paths inside the mouth bbox → scaled rig
  // insertion → optional verify-and-retry. Skip silently if no OpenAI key
  // is set; the character ships unrigged but generation still succeeds.
  if (!settings.has('OPENAI_API_KEY')) return normalized;
  try {
    const initialRaster = await renderSvgToPng(normalized, 1024);
    const result = await rigCharacterWithVision(normalized, {
      initialRaster,
      rerasterize: (s) => renderSvgToPng(s, 1024),
      openai: buildOpenAIClient(),
    });
    if (result.status === 'rigged') return result.svg;
  } catch {
    // Vision fallback failed — return the un-rigged normalized SVG so the
    // generation still succeeds. The user gets a static character rather
    // than an error.
  }
  return normalized;
}

export async function generateScene(prompt: string): Promise<string> {
  configure();
  const fullPrompt = `${prompt}. ${STYLE_HINT}. Background only, no characters. 16:9 aspect.`;
  const r = (await fal.subscribe('fal-ai/recraft/v4/text-to-vector', {
    input: {
      prompt: fullPrompt,
      style: 'vector_illustration',
    },
  })) as { data: { images: Array<{ url: string }> } };
  const url = r.data.images?.[0]?.url;
  if (!url) throw new Error('Recraft returned no image.');
  const svg = await (await fetch(url)).text();
  return svg;
}
