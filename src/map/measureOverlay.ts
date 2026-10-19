import { createMemo, createRoot } from 'solid-js';
import { tapeLine } from '../state/measure';
import type { Overlay } from './overlays';

const SOURCE = 'measure-tape';

/** Round bends and square ends, so that the tape stops where it is measured to. */
const LAYOUT = { 'line-join': 'round' } as const;

/** The measuring tape over everything else: a yellow band in a dark edge, with ticks across it. */
export const measureOverlay: Overlay = {
  id: SOURCE,
  data: createRoot(() =>
    createMemo((): GeoJSON.FeatureCollection => {
      const line = tapeLine();
      return {
        type: 'FeatureCollection',
        features: line ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.points } }] : [],
      };
    }),
  ),
  layers: [
    { id: `${SOURCE}-edge`, type: 'line', source: SOURCE, layout: LAYOUT, paint: { 'line-color': '#212529', 'line-width': 8 } },
    { id: `${SOURCE}-band`, type: 'line', source: SOURCE, layout: LAYOUT, paint: { 'line-color': '#fcc419', 'line-width': 6 } },
    { id: `${SOURCE}-ticks`, type: 'line', source: SOURCE, layout: LAYOUT, paint: { 'line-color': '#212529', 'line-width': 6, 'line-dasharray': [0.25, 1.75] } },
  ],
};
