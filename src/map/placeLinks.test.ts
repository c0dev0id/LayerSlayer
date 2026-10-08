import { describe, expect, it } from 'vitest';
import { googleMapsUrl, latLonText, streetViewUrl } from './placeLinks';

describe('place links', () => {
  const spot: [number, number] = [8.4043592, 49.0135248];

  it('write coordinates latitude first, to six decimals', () => {
    expect(latLonText(spot)).toBe('49.013525,8.404359');
    expect(latLonText([-0.1, -33.9])).toBe('-33.900000,-0.100000');
  });

  it('open Google Maps and Street View at the spot', () => {
    expect(googleMapsUrl(spot)).toBe('https://www.google.com/maps/search/?api=1&query=49.013525,8.404359');
    expect(streetViewUrl(spot)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=49.013525,8.404359');
  });
});
