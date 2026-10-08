import { describe, expect, it } from 'vitest';
import { panelWidthWithin } from './PanelResizer';

describe('panelWidthWithin', () => {
  it('keeps the panel between its bounds and leaves the map room', () => {
    expect(panelWidthWithin(400, 1600)).toBe(400);
    expect(panelWidthWithin(100, 1600)).toBe(260);
    expect(panelWidthWithin(1000, 1600)).toBe(720);
    expect(panelWidthWithin(600, 800)).toBe(480);
  });
});
