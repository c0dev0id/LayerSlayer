import { describe, expect, it } from 'vitest';
import { isWaypointType, WAYPOINT_TYPES } from './waypointType';

describe('isWaypointType', () => {
  it('knows the types, and nothing else a project file might hold', () => {
    for (const { id } of WAYPOINT_TYPES) expect(isWaypointType(id)).toBe(true);
    expect(isWaypointType('rocket')).toBe(false);
    expect(isWaypointType(undefined)).toBe(false);
  });
});
