import { describe, expect, it } from 'vitest';
import { googleMapsUrl, latLonText, readSpotLink, spotLink, streetViewUrl } from './placeLinks';

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

  it('open Layer Slayer at the spot and zoom, and read that back', () => {
    const link = spotLink('https://shagen.me/LayerSlayer/', spot, 15.4567);
    expect(link).toBe('https://shagen.me/LayerSlayer/#map=15.46/49.01352/8.40436');
    expect(readSpotLink(new URL(link).hash)).toEqual({ center: [8.40436, 49.01352], zoom: 15.46 });
    expect(spotLink('https://shagen.me/LayerSlayer/', [-0.1, -33.9], 4)).toBe('https://shagen.me/LayerSlayer/#map=4/-33.90000/-0.10000');
  });

  it('read openstreetmap.org links, and nothing that names no spot the map can show', () => {
    expect(readSpotLink('#map=17/49.0868/7.7106')).toEqual({ center: [7.7106, 49.0868], zoom: 17 });
    expect(readSpotLink('')).toBeUndefined();
    expect(readSpotLink('#map=17/49.0868')).toBeUndefined();
    expect(readSpotLink('#map=30/49/7')).toBeUndefined();
    expect(readSpotLink('#map=10/89/7')).toBeUndefined();
    expect(readSpotLink('#layers=x')).toBeUndefined();
  });
});
