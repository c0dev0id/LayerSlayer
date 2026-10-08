import { describe, expect, it } from 'vitest';
import { parsePoiImageId, poiImageId } from './poiIcons';

describe('poi image ids', () => {
  it('carry the icon and the colour, and are told from other images', () => {
    const id = poiImageId({ id: 'temaki:cattle_grid', size: [15, 15], paths: [] }, '#1c7ed6');
    expect(id).toBe('poi:temaki:cattle_grid:#1c7ed6');
    expect(parsePoiImageId(id)).toEqual({ icon: 'temaki:cattle_grid', color: '#1c7ed6' });
    expect(parsePoiImageId('3f2a:0')).toBeUndefined();
    expect(parsePoiImageId('poi:maki:fuel:red')).toBeUndefined();
  });
});
