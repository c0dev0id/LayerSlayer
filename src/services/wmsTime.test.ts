import { describe, expect, it } from 'vitest';
import { lastTime, timeValues } from './wmsTime';

describe('timeValues', () => {
  it('steps through ranges of years, months and days, written as precisely as their start', () => {
    expect(timeValues('1887/2024/P1Y')).toHaveLength(138);
    expect(timeValues('1887/2024/P1Y')?.slice(0, 2)).toEqual(['1887', '1888']);
    expect(timeValues('1887-01-01/1890-01-01/P1Y')).toEqual(['1887-01-01', '1888-01-01', '1889-01-01', '1890-01-01']);
    expect(timeValues('2020-11/2021-02/P1M')).toEqual(['2020-11', '2020-12', '2021-01', '2021-02']);
    expect(timeValues('2024-02-27/2024-03-01/P1D')).toEqual(['2024-02-27', '2024-02-28', '2024-02-29', '2024-03-01']);
    expect(timeValues('1900/1950/P25Y')).toEqual(['1900', '1925', '1950']);
  });

  it('lists single values and ranges together', () => {
    expect(timeValues('1936, 1945,1950/1952/P1Y')).toEqual(['1936', '1945', '1950', '1951', '1952']);
  });

  it('has no list for times of day, periods finer than the dates or too many times', () => {
    expect(timeValues('2024-01-01T00:00:00Z/2024-01-02T00:00:00Z/PT1H')).toBeUndefined();
    expect(timeValues('2000/2024/P1M')).toBeUndefined();
    expect(timeValues('1900-01-01/2024-01-01/P1D')).toBeUndefined();
    expect(timeValues('2000/2024/P0Y')).toBeUndefined();
    expect(timeValues(' ')).toBeUndefined();
  });
});

describe('lastTime', () => {
  it('is the last value or the end of the last range', () => {
    expect(lastTime('1887/2024/P1Y')).toBe('2024');
    expect(lastTime('1936,1945')).toBe('1945');
  });
});
