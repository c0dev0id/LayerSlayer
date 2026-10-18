/** What a waypoint marks; each type is drawn as its own little object standing on the map. */
export type WaypointType = 'start' | 'finish' | 'photo' | 'meeting' | 'break' | 'food' | 'drinks' | 'fuel' | 'warning' | 'info';

export const WAYPOINT_TYPES: readonly { id: WaypointType; name: string }[] = [
  { id: 'start', name: 'Start' },
  { id: 'finish', name: 'Finish' },
  { id: 'photo', name: 'Photo spot' },
  { id: 'meeting', name: 'Meeting point' },
  { id: 'break', name: 'Break' },
  { id: 'food', name: 'Food' },
  { id: 'drinks', name: 'Drinks' },
  { id: 'fuel', name: 'Fuel' },
  { id: 'warning', name: 'Warning' },
  { id: 'info', name: 'Info' },
];

/** Whether a stored value is a waypoint type; waypoints of a type this version does not know are drawn as pins. */
export const isWaypointType = (value: unknown): value is WaypointType => WAYPOINT_TYPES.some((t) => t.id === value);
