import { z } from 'zod';

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  svg: z.string(),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  scale: z.number().min(0.1).max(3),
  z: z.number().int(),
  // Per-character voice mapping. Used as the default when adding a line
  // (manual or AI-generated) so the dialogue tab doesn't reset to a global
  // default each time. Per-line overrides still live on DialogueLine.
  provider: z.string(),
  model: z.string(),
  voice: z.string(),
});

export const SceneSchema = z.object({
  id: z.string(),
  name: z.string(),
  svg: z.string(),
});

export const DialogueLineSchema = z.object({
  id: z.string(),
  speakerId: z.string(),
  text: z.string(),
  provider: z.string(),
  model: z.string(),
  voice: z.string(),
});

export const ShowSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  scene: SceneSchema.nullable(),
  characters: z.array(CharacterSchema),
  dialogue: z.array(DialogueLineSchema),
});

export type Character = z.infer<typeof CharacterSchema>;
export type Scene = z.infer<typeof SceneSchema>;
export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type Show = z.infer<typeof ShowSchema>;

export type ShowSummary = {
  id: string;
  name: string;
  updatedAt: number;
};

export function emptyShow(name = 'Untitled show'): Show {
  const now = Date.now();
  return {
    id: cryptoRandomId(),
    name,
    createdAt: now,
    updatedAt: now,
    scene: null,
    characters: [],
    dialogue: [],
  };
}

function cryptoRandomId(): string {
  // Renderer + main both have crypto.randomUUID via global.
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2) + Date.now().toString(36)
  );
}
