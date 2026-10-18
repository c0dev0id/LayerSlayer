/** What a waypoint marks; each type is drawn as its own little object standing on the map. */
export type WaypointType = 'start' | 'finish' | 'photo' | 'meeting' | 'break' | 'food' | 'drinks' | 'fuel';

export const WAYPOINT_TYPES: readonly { id: WaypointType; name: string }[] = [
  { id: 'start', name: 'Start' },
  { id: 'finish', name: 'Finish' },
  { id: 'photo', name: 'Photo spot' },
  { id: 'meeting', name: 'Meeting point' },
  { id: 'break', name: 'Break' },
  { id: 'food', name: 'Food' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'fuel', name: 'Fuel' },
];
