import { describe, expect, it } from 'vitest';
import { elevationColor, isRouteColoring, rainbowColor, slopeColor, surfaceColor } from './routeColoring';

describe('route colourings', () => {
  it('knows its colourings', () => {
    expect(isRouteColoring('slope-reversed')).toBe(true);
    expect(isRouteColoring('plaid')).toBe(false);
  });

  it('runs the rainbow from red to violet, and the elevation ramp from green to red', () => {
    expect(rainbowColor(0)).toBe('hsl(0, 85%, 50%)');
    expect(rainbowColor(1)).toBe('hsl(280, 85%, 50%)');
    expect(elevationColor(0)).toBe('#2f9e44');
    expect(elevationColor(0.5)).toBe('#fcc419');
    expect(elevationColor(1)).toBe('#c92a2a');
    expect(elevationColor(Number.NaN)).toBe('#2f9e44');
  });

  it('colours continuous values in steps, so that nearby values share a colour', () => {
    expect(rainbowColor(0.5)).toBe(rainbowColor(0.51));
    expect(elevationColor(0.19)).toBe(elevationColor(0.2));
  });

  it('colours climbs warm and descents cool, from the class a grade falls in', () => {
    expect(slopeColor(0)).toBe('#40c057');
    expect(slopeColor(-3)).toBe('#40c057');
    expect(slopeColor(-3.1)).toBe('#a5d8ff');
    expect(slopeColor(10)).toBe('#e03131');
    expect(slopeColor(40)).toBe('#862e9c');
    expect(slopeColor(-40)).toBe('#364fc7');
    expect(surfaceColor('gravel')).toBe('#f76707');
  });
});
