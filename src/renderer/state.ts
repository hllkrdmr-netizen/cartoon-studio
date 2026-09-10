import { signal, batch, effect } from '@preact/signals-core';
import { emptyShow, type Show, type ShowSummary } from '../shared/show';

export type Screen = 'stage' | 'dialogue' | 'play';
export const currentScreen = signal<Screen>('stage');

export const currentShow = signal<Show>(emptyShow('Loading…'));
export const allShows = signal<ShowSummary[]>([]);

export const selection = signal<{
  type: 'character' | 'line' | 'scene' | null;
  id: string | null;
}>({ type: null, id: null });

const isBooted = signal(false);
const LAST_SHOW_KEY = 'cartoonstudio.lastShowId';

effect(() => {
  if (currentScreen.value !== 'stage' && selection.value.type === 'character') {
    selection.value = { type: null, id: null };
  }
});

let saveTimer: number | undefined;
const SAVE_DEBOUNCE_MS = 500;

export function mutate(updater: (s: Show) => Show): void {
  batch(() => {
    currentShow.value = updater(currentShow.value);
  });
}

export function loadShow(show: Show): void {
  selection.value = { type: null, id: null };
  currentShow.value = show;
  try {
    localStorage.setItem(LAST_SHOW_KEY, show.id);
  } catch {
    /* localStorage disabled */
  }
}

effect(() => {
  const show = currentShow.value;
  if (!isBooted.value) return;
  if (saveTimer !== undefined) clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void window.api
      .showSave(show)
      .then(() => void refreshShowList())
      .catch(() => {
        /* save failed */
      });
  }, SAVE_DEBOUNCE_MS);
});

export async function refreshShowList(): Promise<void> {
  try {
    allShows.value = await window.api.showList();
  } catch {
    /* keep existing list */
  }
}

export async function bootShows(): Promise<void> {
  if (isBooted.value) return;
  await refreshShowList();

  const lastId = (() => {
    try {
      return localStorage.getItem(LAST_SHOW_KEY);
    } catch {
      return null;
    }
  })();

  let show: Show | null = null;
  if (lastId && allShows.value.some((s) => s.id === lastId)) {
    show = await window.api.showLoad(lastId).catch(() => null);
  }
  if (!show && allShows.value.length > 0) {
    show = await window.api.showLoad(allShows.value[0].id).catch(() => null);
  }
  if (!show) {
    show = emptyShow('Untitled show');
    await window.api.showSave(show);
    await refreshShowList();
  }

  selection.value = { type: null, id: null };
  currentShow.value = show;
  try {
    localStorage.setItem(LAST_SHOW_KEY, show.id);
  } catch {
    /* ignore */
  }
  isBooted.value = true;
}

export async function createShow(name: string): Promise<Show> {
  const fresh = emptyShow(name.trim() || 'Untitled show');
  await window.api.showSave(fresh);
  await refreshShowList();
  loadShow(fresh);
  return fresh;
}

/**
 * Fairy-tale pilot preset.
 * Narration and Mino dialogue are deliberately separated:
 * - narrator lines use a hidden voice-over character with no mouth rig
 * - Mino lines use Mino's visible rig, so only his own dialogue lip-syncs
 */
export async function createMinoPilotShow(): Promise<Show> {
  const assets = await window.api.defaultsList();
  const mino = assets.find((a) => a.type === 'character' && a.id === 'character:mino');
  const forest = assets.find(
    (a) => a.type === 'scene' && a.id === 'scene:scene-enchanted-forest-night',
  );

  if (!mino) throw new Error('Bundled Mino character asset was not found.');
  if (!forest) throw new Error('Bundled enchanted forest scene asset was not found.');

  const fresh = emptyShow('Mino ve Uyuyan Yıldız');
  const minoId = `mino-${cryptoRandomId()}`;
  const narratorId = `narrator-${cryptoRandomId()}`;

  const narratorVoice = {
    provider: 'elevenlabs',
    model: 'elevenlabs/eleven_v3',
    voice: 'XB0fDUnXU5powFXDhCwa',
  };
  const minoVoice = {
    provider: 'elevenlabs',
    model: 'elevenlabs/eleven_v3',
    voice: 'TX3LPaxmHKxFdv7VOQHJ',
  };

  const narrator = (text: string) => ({
    id: cryptoRandomId(),
    speakerId: narratorId,
    text,
    ...narratorVoice,
  });
  const minoLine = (text: string) => ({
    id: cryptoRandomId(),
    speakerId: minoId,
    text,
    ...minoVoice,
  });

  const invisibleNarratorSvg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" width="10" height="10" data-character="narrator">
      <g opacity="0"><rect width="10" height="10" fill="transparent"/></g>
    </svg>`;

  const show: Show = {
    ...fresh,
    scene: {
      id: forest.id,
      name: forest.name,
      svg: forest.svg,
    },
    characters: [
      {
        id: minoId,
        name: 'Mino',
        svg: mino.svg,
        x: 0.5,
        y: 0.94,
        scale: 1.35,
        z: 10,
        ...minoVoice,
      },
      {
        id: narratorId,
        name: 'Anlatıcı (Voice-over)',
        svg: invisibleNarratorSvg,
        x: 0.5,
        y: 0.5,
        scale: 0.1,
        z: -100,
        ...narratorVoice,
      },
    ],
    dialogue: [
      narrator('Bir varmış, bir yokmuş… Uzaklarda, yıldızların geceleri ağaçların arasına kadar indiği küçük bir ormanda, Mino adında meraklı bir tavşan yaşarmış.'),
      narrator('Bir gece Mino, çimenlerin arasında titreyen minicik bir ışık görmüş. Yaklaştığında bunun gökyüzünden düşmüş küçük bir yıldız olduğunu anlamış.'),
      minoLine('Aa! Sen de kimsin böyle?'),
      minoLine('Merak etme. Seni evine götüreceğim.'),
      narrator('Mino, küçük yıldızı dikkatlice avuçlarına alıp ormanın en yüksek tepesine doğru yürümeye başlamış.'),
      narrator('Tepeye vardıklarında yıldızın ışığı iyice azalmış.'),
      minoLine('Işığın azalmış… Ama seni yalnız bırakmam.'),
      narrator('Mino gözlerini kapatmış ve bütün kalbiyle bir dilek tutmuş.'),
      minoLine('Hadi, yeniden parlamanı dileyelim.'),
      narrator('Birden yıldız yeniden parlamaya başlamış. Havaya yükselmiş ve gökyüzündeki arkadaşlarının yanına dönmüş.'),
      narrator('O geceden sonra gökyüzündeki en parlak yıldız, her gece Mino’nun küçük evini aydınlatmış. Çünkü gerçek dostluk, karanlıkta bile yolunu bulurmuş.'),
    ],
  };

  await window.api.showSave(show);
  await refreshShowList();
  loadShow(show);
  return show;
}

export function renameCurrentShow(name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  mutate((s) => ({ ...s, name: trimmed }));
}

export async function deleteShow(id: string): Promise<void> {
  await window.api.showDelete(id);
  await refreshShowList();
  if (currentShow.value.id !== id) return;
  if (allShows.value.length > 0) {
    const next = await window.api.showLoad(allShows.value[0].id);
    loadShow(next);
  } else {
    const fresh = emptyShow('Untitled show');
    await window.api.showSave(fresh);
    await refreshShowList();
    loadShow(fresh);
  }
}

function cryptoRandomId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}
