export const WAYPOINT_TYPES = [
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
] as const;

/** What a waypoint marks; each type is drawn as its own little object standing on the map. */
export type WaypointType = (typeof WAYPOINT_TYPES)[number]['id'];

/** Whether a stored value is a waypoint type; waypoints of a type this version does not know are drawn as pins. */
export const isWaypointType = (value: unknown): value is WaypointType => WAYPOINT_TYPES.some((t) => t.id === value);
