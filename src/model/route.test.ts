import { describe, expect, it } from 'vitest';
import { MAX_LABEL_SIZE } from './label';
import { WAYPOINT_COLOR, WAYPOINT_TEXT_SIZE, waypointLook } from './route';

describe('waypointLook', () => {
  it('draws red pins and leaves the name colours to the theme where the route sets none', () => {
    expect(waypointLook()).toEqual({ pin: WAYPOINT_COLOR, size: WAYPOINT_TEXT_SIZE });
    expect(waypointLook({ waypointColor: '#1971c2', waypointTextColor: '#ffffff', waypointBoxColor: '#000000' })).toEqual({
      pin: '#1971c2',
      text: '#ffffff',
      size: WAYPOINT_TEXT_SIZE,
      box: '#000000',
    });
  });

  it('keeps sizes within bounds and drops what is no colour, whatever a project file says', () => {
    expect(waypointLook({ waypointColor: 'blue', waypointTextColor: 'white', waypointTextSize: 99 })).toEqual({ pin: WAYPOINT_COLOR, size: MAX_LABEL_SIZE });
  });
});
