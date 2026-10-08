import { describe, expect, it } from 'vitest';
import type { Offer } from '../services/types';
import { groupMembers, isFromSource, originOf, selection } from './offers';

const draft = { name: 'x', source: { type: 'geojson', data: { url: 'https://x' } } } as const;
const offers: Offer[] = [
  { title: 'Root', depth: 0 },
  { title: 'Roads', depth: 1 },
  { title: 'Motorways', name: 'motorways', depth: 2, draft },
  { title: 'Paths', name: 'paths', depth: 2, draft },
  { title: 'Rail', name: 'rail', depth: 1, draft },
  { title: 'UTM only', name: 'utm', depth: 1, reason: 'Not offered in Web Mercator.' },
  { title: 'Other root', name: 'other', depth: 0, draft },
];

describe('groupMembers', () => {
  it('takes the addable offers nested under a heading', () => {
    expect(groupMembers(offers, 0).map((o) => o.name)).toEqual(['motorways', 'paths', 'rail']);
    expect(groupMembers(offers, 1).map((o) => o.name)).toEqual(['motorways', 'paths']);
    expect(groupMembers(offers, 6)).toEqual([]);
  });
});

describe('selection', () => {
  it('tells none, some and all apart', () => {
    const members = groupMembers(offers, 1);
    expect(selection(members, () => false)).toBe('none');
    expect(selection(members, (o) => o.name === 'paths')).toBe('some');
    expect(selection(members, () => true)).toBe('all');
  });
});

describe('origins', () => {
  it('name the source and the layer, and are told apart by source', () => {
    const origin = originOf('https://w.example/wms?SERVICE=WMS', offers[2]!);
    expect(origin).toBe('https://w.example/wms?SERVICE=WMS motorways');
    expect(isFromSource(origin, 'https://w.example/wms?SERVICE=WMS')).toBe(true);
    expect(isFromSource(origin, 'https://w.example/wms')).toBe(false);
    expect(isFromSource(undefined, 'https://w.example/wms')).toBe(false);
  });

  it('are the address alone for an offer without a name', () => {
    const origin = originOf('https://a/MapServer', { title: 'A (all layers)', depth: 0, draft });
    expect(origin).toBe('https://a/MapServer');
    expect(isFromSource(origin, 'https://a/MapServer')).toBe(true);
  });
});
