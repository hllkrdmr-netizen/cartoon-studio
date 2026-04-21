import { fal } from '@fal-ai/client';
import { applyKeysToEnv } from './env';
import { settings } from './settings';
import { rigSvg, stripMagenta, normalizeViewBox } from './svgRig';

let configured = false;
function configure(): void {
  applyKeysToEnv();
  const key = settings.get('FAL_KEY');
  if (!key) {
    throw new Error('FAL_KEY is not set. Add it in Settings to generate.');
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
  const stripped = stripMagenta(svg);
  const normalized = normalizeViewBox(stripped);
  const rigged = rigSvg(normalized);
  return rigged.svg;
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
