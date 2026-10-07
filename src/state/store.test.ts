import { describe, expect, it } from 'vitest';
import { defaultState, moveItem, parseState } from './store';

describe('parseState', () => {
  it('keeps valid layers and drops malformed ones', () => {
    const valid = defaultState().layers[0]!;
    const state = parseState(
      JSON.stringify({
        layers: [valid, { id: 'x', name: 'broken' }, { ...valid, id: 'y', source: { type: 'mbtiles' } }],
        activeLayerId: 'x',
        settings: { proxy: 'https://p/?u={url}', proxiedHosts: ['a', 1] },
        view: { center: [1, 2], zoom: 3 },
      }),
    );
    expect(state.layers).toEqual([valid]);
    expect(state.activeLayerId).toBe(valid.id);
    expect(state.settings).toEqual({ proxy: 'https://p/?u={url}', proxiedHosts: ['a'] });
    expect(state.view).toEqual({ center: [1, 2], zoom: 3, bearing: 0, pitch: 0 });
  });

  it('keeps an empty layer list empty', () => {
    expect(parseState('{"layers":[]}').layers).toEqual([]);
  });

  it('throws on text that is not JSON', () => {
    expect(() => parseState('nope')).toThrow();
  });
});

describe('moveItem', () => {
  it('moves up and down and clamps to the ends', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b', 'c'], 1, 9)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], -1, 1)).toEqual(['a', 'b', 'c']);
  });
});
