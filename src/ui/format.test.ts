import { describe, expect, it } from 'vitest';
import { countText, durationText, sizeText } from './format';

describe('format', () => {
  it('counts with the noun, singular for one', () => {
    expect(countText(0, 'tile')).toBe('0 tiles');
    expect(countText(1, 'tile')).toBe('1 tile');
    expect(countText(1234, 'tile')).toBe('1,234 tiles');
  });

  it('gives sizes in the unit that reads best', () => {
    expect(sizeText(0)).toBe('0 kB');
    expect(sizeText(820_400)).toBe('820 kB');
    expect(sizeText(93_100_000)).toBe('93.1 MB');
    expect(sizeText(1_234_000_000)).toBe('1.2 GB');
  });

  it('gives durations in the unit that reads best', () => {
    expect(durationText(0.2)).toBe('1 s');
    expect(durationText(40)).toBe('40 s');
    expect(durationText(12 * 60 + 10)).toBe('12 min');
    expect(durationText(125 * 60)).toBe('2 h 5 min');
    expect(durationText(120 * 60)).toBe('2 h');
  });
});
