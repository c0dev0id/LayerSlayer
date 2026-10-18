import { describe, expect, it } from 'vitest';
import { waypointScale } from './waypointScale';

describe('waypointScale', () => {
  it('draws waypoints at full size from zoom 14 and halves them every four zooms below, down to about a third', () => {
    expect(waypointScale(14)).toBe(1);
    expect(waypointScale(18)).toBe(1);
    expect(waypointScale(10)).toBeCloseTo(0.5);
    expect(waypointScale(12)).toBeCloseTo(Math.SQRT1_2);
    expect(waypointScale(2)).toBe(0.35);
  });

  it('draws them at the smallest size where the zoom cannot be measured', () => {
    expect(waypointScale(Number.NaN)).toBe(0.35);
    expect(waypointScale(Number.NEGATIVE_INFINITY)).toBe(0.35);
  });
});
