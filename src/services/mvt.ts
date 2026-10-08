import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';

/** The names of the layers in a vector tile; none for data that is not one. */
export function tileLayerNames(data: ArrayBuffer | undefined): string[] | undefined {
  if (!data) return undefined;
  try {
    return Object.keys(new VectorTile(new PbfReader(new Uint8Array(data))).layers);
  } catch {
    return undefined;
  }
}
