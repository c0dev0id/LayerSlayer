import { describe, expect, it } from 'vitest';
import { parseTheme, toggledChoice } from './theme';

describe('theme', () => {
  it('reads a kept choice and ignores anything else', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('auto')).toBeUndefined();
    expect(parseTheme(undefined)).toBeUndefined();
  });

  it("keeps a choice against the browser's preference, and forgets it when toggled back", () => {
    expect(toggledChoice('light', 'light')).toBe('dark');
    expect(toggledChoice('dark', 'light')).toBeUndefined();
    expect(toggledChoice('dark', 'dark')).toBe('light');
    expect(toggledChoice('light', 'dark')).toBeUndefined();
  });
});
