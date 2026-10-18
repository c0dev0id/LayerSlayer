import { describe, expect, it } from 'vitest';
import { LABEL_STYLE, labelStyle, MAX_LABEL_SIZE, MAX_OUTLINE_WIDTH, MIN_LABEL_SIZE, type LabelStyle } from './label';

describe('labelStyle', () => {
  it('fills in the defaults where a layer sets none', () => {
    expect(labelStyle(undefined)).toEqual(LABEL_STYLE);
    expect(labelStyle({ color: '#ff0000' })).toEqual({ ...LABEL_STYLE, color: '#ff0000' });
  });

  it('keeps sizes and widths within bounds and drops what is no colour, whatever a project file says', () => {
    const stored = { color: 'red', size: 100, outlineColor: '#00FF00', outlineWidth: -1 } as LabelStyle;
    expect(labelStyle(stored)).toEqual({ color: LABEL_STYLE.color, size: MAX_LABEL_SIZE, outlineColor: '#00FF00', outlineWidth: 0 });
    expect(labelStyle({ size: 1, outlineWidth: 9 })).toMatchObject({ size: MIN_LABEL_SIZE, outlineWidth: MAX_OUTLINE_WIDTH });
    expect(labelStyle({ size: Number.NaN })).toMatchObject({ size: LABEL_STYLE.size });
  });
});
