import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/** The names of the layers in a vector tile. */
export function tileLayerNames(data: ArrayBuffer): string[] {
  return Object.keys(new VectorTile(new PbfReader(new Uint8Array(data))).layers);
}
