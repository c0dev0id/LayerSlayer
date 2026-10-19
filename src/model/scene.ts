import { within } from './stored';

/** The sky over 3D terrain. */
export type TerrainSky = 'day' | 'night';

/** How the map looks while the ground is in 3D. */
export interface Scene {
  sky: TerrainSky;
  /** Whether the buildings of map styles stand up. */
  buildings: boolean;
  /** Whether the labels and icons of map styles show. */
  labels: boolean;
  /** Metres the labels and icons of every layer float above the ground. */
  symbolDistance: number;
}

export const DEFAULT_SCENE: Scene = { sky: 'day', buildings: true, labels: true, symbolDistance: 0 };

export const MAX_SYMBOL_DISTANCE = 300;

/** A stored scene, each part that is not one as DEFAULT_SCENE has it. */
export function parseScene(value: unknown): Scene {
  const stored = (value ?? {}) as Partial<Record<keyof Scene, unknown>>;
  return {
    sky: stored.sky === 'night' ? 'night' : 'day',
    buildings: typeof stored.buildings === 'boolean' ? stored.buildings : DEFAULT_SCENE.buildings,
    labels: typeof stored.labels === 'boolean' ? stored.labels : DEFAULT_SCENE.labels,
    symbolDistance: within(stored.symbolDistance, 0, MAX_SYMBOL_DISTANCE, DEFAULT_SCENE.symbolDistance),
  };
}
