/**
 * The times a WMS time extent lists (OGC WMS 1.3.0, annex C): single values and
 * start/end/period ranges, separated by commas.
 */

/** A date written as a year, a month or a day. */
const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
/** A period of years, months or days. */
const PERIOD = /^P(\d+)([YMD])$/;

/** Most times offered to choose from; longer lists are typed instead. */
const MAX_TIMES = 1000;

/**
 * The times an extent lists, to choose from. Ranges are stepped through where their
 * dates are years, months or days and their period is too, as for maps of several
 * editions; for times of day, or more than a thousand times, there is no list.
 */
export function timeValues(extent: string): string[] | undefined {
  const values: string[] = [];
  for (const part of extent.split(',').map((p) => p.trim())) {
    if (!part) continue;
    const range = part.split('/');
    if (range.length === 1) values.push(part);
    else if (range.length === 3) {
      const steps = stepRange(range[0]!, range[1]!, range[2]!);
      if (!steps) return undefined;
      values.push(...steps);
    } else return undefined;
    if (values.length > MAX_TIMES) return undefined;
  }
  return values.length > 0 ? values : undefined;
}

/** The time a layer is drawn at unless the service names a default: the last it lists. */
export function lastTime(extent: string): string {
  const range = extent.split(',').pop()!.trim().split('/');
  return range[1] ?? range[0]!;
}

/** The dates from start to end by the period, written as precisely as the start; undefined beyond the most times offered. */
function stepRange(start: string, end: string, period: string): string[] | undefined {
  const from = DATE.exec(start);
  const to = DATE.exec(end);
  const step = PERIOD.exec(period);
  if (!from || !to || !step) return undefined;
  const precision = from[3] ? 3 : from[2] ? 2 : 1;
  const unit = step[2] as 'Y' | 'M' | 'D';
  // A period finer than the dates is written would repeat them.
  if ((unit === 'M' && precision < 2) || (unit === 'D' && precision < 3)) return undefined;
  const n = Number(step[1]);
  if (n === 0) return undefined;
  const last = Date.UTC(Number(to[1]), Number(to[2] ?? 1) - 1, Number(to[3] ?? 1));
  const date = new Date(Date.UTC(Number(from[1]), Number(from[2] ?? 1) - 1, Number(from[3] ?? 1)));
  const dates: string[] = [];
  while (date.getTime() <= last) {
    if (dates.length === MAX_TIMES) return undefined;
    dates.push(date.toISOString().slice(0, [4, 7, 10][precision - 1]));
    if (unit === 'Y') date.setUTCFullYear(date.getUTCFullYear() + n);
    else if (unit === 'M') date.setUTCMonth(date.getUTCMonth() + n);
    else date.setUTCDate(date.getUTCDate() + n);
  }
  return dates;
}
