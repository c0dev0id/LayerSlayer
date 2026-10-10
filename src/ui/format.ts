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
