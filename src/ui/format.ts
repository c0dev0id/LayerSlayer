/** Counts and sizes in words for the interface. */

/** A count of things with its noun: "1 tile", "1,234 tiles". */
export function countText(count: number, noun: string): string {
  return `${count.toLocaleString('en-US')} ${noun}${count === 1 ? '' : 's'}`;
}

/** A size in bytes in the unit that reads best: "820 kB", "93.1 MB", "1.2 GB". */
export function sizeText(bytes: number): string {
  if (bytes < 1e6) return `${Math.round(bytes / 1e3)} kB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

/** A duration in the unit that reads best: "40 s", "12 min", "2 h 5 min". */
export function durationText(seconds: number): string {
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}
