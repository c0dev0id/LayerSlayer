/** Values read from stored state and project files, which may hold anything. */

/** A number within bounds; `fallback` where unset or not a number. */
export function within(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

/** Whether a value is a colour written as #rrggbb. */
export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);
}
