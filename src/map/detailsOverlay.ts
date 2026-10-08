import { detailsHighlight } from '../state/details';
import { ROUND_LINE, type Overlay } from './overlays';

/** What the open details are about, marked on the map: the roads, places and barriers found, and the spot asked about. */

const HIGHLIGHT_COLOR = '#f59f00';
const SOURCE = 'details-highlight';
const LINES = ['in', ['geometry-type'], ['literal', ['LineString', 'MultiLineString']]];
const FOUND_POINTS = ['all', ['in', ['geometry-type'], ['literal', ['Point', 'MultiPoint']]], ['!=', ['get', 'kind'], 'spot']];

export const detailsOverlay: Overlay = {
  id: SOURCE,
  data: detailsHighlight,
  layers: [
    { id: `${SOURCE}-casing`, type: 'line', source: SOURCE, filter: LINES as never, layout: ROUND_LINE, paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': 0.9 } },
    { id: `${SOURCE}-line`, type: 'line', source: SOURCE, filter: LINES as never, layout: ROUND_LINE, paint: { 'line-color': HIGHLIGHT_COLOR, 'line-width': 5 } },
    {
      id: `${SOURCE}-point`,
      type: 'circle',
      source: SOURCE,
      filter: FOUND_POINTS as never,
      paint: { 'circle-radius': 11, 'circle-color': 'rgba(245, 159, 0, 0.25)', 'circle-stroke-color': HIGHLIGHT_COLOR, 'circle-stroke-width': 3 },
    },
    {
      id: `${SOURCE}-spot`,
      type: 'circle',
      source: SOURCE,
      filter: ['==', ['get', 'kind'], 'spot'],
      paint: { 'circle-radius': 4, 'circle-color': '#212529', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    },
  ],
};
