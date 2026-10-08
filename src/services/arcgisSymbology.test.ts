import { describe, expect, it } from 'vitest';
import { readSymbology } from './arcgisSymbology';

const marker = (color: number[], size = 8) => ({ type: 'esriSMS', style: 'esriSMSCircle', color, size, outline: { color: [255, 255, 255, 255], width: 1 } });
const fill = (color: number[], outline = [0, 0, 0, 255], style = 'esriSFSSolid') => ({
  type: 'esriSFS',
  style,
  color,
  outline: { type: 'esriSLS', style: 'esriSLSSolid', color: outline, width: 0.75 },
});

describe('readSymbology', () => {
  it('names an icon for each marker of a simple point renderer', () => {
    const s = readSymbology({ renderer: { type: 'simple', symbol: marker([230, 0, 0, 255]) as never }, transparency: 25 }, 'point', 'L:');
    expect(s.icon).toBe('L:0');
    expect(s.markers).toEqual({ 'L:0': marker([230, 0, 0, 255]) });
    expect(s.opacity).toBe(0.75);
  });

  it('matches field values of a unique value renderer, with the default symbol for the rest', () => {
    const s = readSymbology(
      {
        renderer: {
          type: 'uniqueValue',
          field1: 'KIND',
          defaultSymbol: fill([200, 200, 200, 255]) as never,
          uniqueValueInfos: [
            { value: 'park', symbol: fill([0, 128, 0, 128]) as never },
            { value: 7, symbol: fill([0, 0, 255, 255], [0, 0, 0, 255], 'esriSFSForwardDiagonal') as never },
            { value: 'park', symbol: fill([1, 1, 1, 255]) as never },
          ],
        },
      },
      'polygon',
      'L:',
    );
    expect(s.fillColor).toEqual(['match', ['to-string', ['get', 'KIND']], 'park', 'rgba(0,128,0,0.502)', '7', 'rgba(0,0,255,0.35)', 'rgba(200,200,200,1)']);
    expect(s.lineColor).toEqual(['match', ['to-string', ['get', 'KIND']], 'park', 'rgba(0,0,0,1)', '7', 'rgba(0,0,0,1)', 'rgba(0,0,0,1)']);
    expect(s.lineWidth).toEqual(['match', ['to-string', ['get', 'KIND']], 'park', 1, '7', 1, 1]);
    expect(s).not.toHaveProperty('lineDash');
  });

  it('joins several fields with the delimiter', () => {
    const s = readSymbology(
      { renderer: { type: 'uniqueValue', field1: 'A', field2: 'B', fieldDelimiter: '|', uniqueValueInfos: [{ value: 'x|y', symbol: marker([1, 2, 3, 255]) as never }] } },
      'point',
      'L:',
    );
    expect(s.icon).toEqual(['match', ['concat', ['to-string', ['get', 'A']], '|', ['to-string', ['get', 'B']]], 'x|y', 'L:0', '']);
  });

  it('steps through class breaks, up to and including each maximum', () => {
    const line = (width: number, style = 'esriSLSSolid') => ({ type: 'esriSLS', style, color: [0, 0, 0, 255], width });
    const s = readSymbology(
      {
        renderer: {
          type: 'classBreaks',
          field: 'VOLTAGE',
          classBreakInfos: [
            { classMaxValue: 380, symbol: line(3) as never },
            { classMaxValue: 110, symbol: line(1.5, 'esriSLSDash') as never },
          ],
        },
      },
      'line',
      'L:',
    );
    expect(s.lineWidth).toEqual(['case', ['==', ['get', 'VOLTAGE'], null], 0, ['step', ['to-number', ['get', 'VOLTAGE']], 2, 110 + 1e-9, 4]]);
    expect(s.lineDash).toEqual([
      'case',
      ['==', ['get', 'VOLTAGE'], null],
      ['literal', [1, 0]],
      ['step', ['to-number', ['get', 'VOLTAGE']], ['literal', [3, 2]], 110 + 1e-9, ['literal', [1, 0]]],
    ]);
  });

  it('says why it cannot draw a renderer or symbol', () => {
    expect(() => readSymbology({ renderer: { type: 'heatmap' } }, 'point', 'L:')).toThrow('heatmap renderer');
    expect(() => readSymbology({ renderer: { type: 'simple', symbol: { type: 'CIMSymbolReference' } } }, 'point', 'L:')).toThrow('CIM symbols');
    expect(() => readSymbology(undefined, 'point', 'L:')).toThrow('no symbology');
  });
});
