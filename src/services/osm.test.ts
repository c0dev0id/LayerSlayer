import { describe, expect, it } from 'vitest';
import { formatFilter, matchesFilter, parseFilter, postpassOrOverpass } from './osm';

describe('parseFilter', () => {
  it('reads tags with a value or any value', () => {
    expect(parseFilter('amenity=drinking_water')).toEqual([{ key: 'amenity', op: 'eq', value: 'drinking_water' }]);
    expect(parseFilter('shop=*')).toEqual([{ key: 'shop', op: 'any' }]);
    expect(parseFilter('  shop ')).toEqual([{ key: 'shop', op: 'any' }]);
  });

  it('reads several tags, which must all match', () => {
    expect(parseFilter('power=generator generator:source=wind')).toEqual([
      { key: 'power', op: 'eq', value: 'generator' },
      { key: 'generator:source', op: 'eq', value: 'wind' },
    ]);
  });

  it('allows spaces around the equals sign and quotes around spaces', () => {
    expect(parseFilter('amenity = bench')).toEqual([{ key: 'amenity', op: 'eq', value: 'bench' }]);
    expect(parseFilter('operator="Deutsche Bahn" "a b"=c')).toEqual([
      { key: 'operator', op: 'eq', value: 'Deutsche Bahn' },
      { key: 'a b', op: 'eq', value: 'c' },
    ]);
    expect(parseFilter('name="*"')).toEqual([{ key: 'name', op: 'eq', value: '*' }]);
    expect(parseFilter('name=""')).toEqual([{ key: 'name', op: 'eq', value: '' }]);
  });

  it('reads values a tag must contain', () => {
    expect(parseFilter('name~Sonderwaffenlager')).toEqual([{ key: 'name', op: 'contains', value: 'Sonderwaffenlager' }]);
    expect(parseFilter('name ~ "Special Ammunition" military=*')).toEqual([
      { key: 'name', op: 'contains', value: 'Special Ammunition' },
      { key: 'military', op: 'any' },
    ]);
    expect(() => parseFilter('name~')).toThrow('is not a tag');
  });

  it('says what it cannot read', () => {
    expect(() => parseFilter('')).toThrow('Name at least one tag');
    expect(() => parseFilter('amenity=')).toThrow('“amenity=” is not a tag');
    expect(() => parseFilter('=bench')).toThrow('“=bench” is not a tag');
    expect(() => parseFilter('name="Main Street')).toThrow('is not a tag');
    expect(() => parseFilter('a"b"')).toThrow('is not a tag');
    expect(() => parseFilter('""=x')).toThrow('A tag needs a key.');
  });
});

describe('formatFilter', () => {
  it('writes filters one way, quoting where needed', () => {
    expect(formatFilter(parseFilter('amenity = bench  shop'))).toBe('amenity=bench shop=*');
    expect(formatFilter(parseFilter('operator="Deutsche Bahn" name="*" ref=""'))).toBe('operator="Deutsche Bahn" name="*" ref=""');
    expect(formatFilter(parseFilter('name ~ "Special Ammunition" ref~*'))).toBe('name~"Special Ammunition" ref~*');
  });
});

describe('matchesFilter', () => {
  it('matches tags as Overpass finds them', () => {
    const tags = { name: 'Ehemaliges US-Sonderwaffenlager Clausen', natural: 'grassland' };
    expect(matchesFilter('name~sonderwaffenlager', tags)).toBe(true);
    expect(matchesFilter('name~Sonderwaffenlager natural=grassland', tags)).toBe(true);
    expect(matchesFilter('name~Raketenstellung', tags)).toBe(false);
    expect(matchesFilter('natural=*', tags)).toBe(true);
    expect(matchesFilter('natural=heath', tags)).toBe(false);
    expect(matchesFilter('landuse=*', tags)).toBe(false);
  });
});

describe('postpassOrOverpass', () => {
  const fail = (reason: string) => () => Promise.reject(new Error(reason));

  it('takes the Postpass answer, and asks the Overpass API only where Postpass fails', async () => {
    let overpassAsked = false;
    const overpass = () => ((overpassAsked = true), Promise.resolve(2));
    await expect(postpassOrOverpass(() => Promise.resolve(1), overpass)).resolves.toBe(1);
    expect(overpassAsked).toBe(false);
    await expect(postpassOrOverpass(fail('down'), overpass)).resolves.toBe(2);
  });

  it('names both reasons where neither answers', async () => {
    await expect(postpassOrOverpass(fail('down.'), fail('busy.'))).rejects.toThrow('Postpass: down. Overpass API: busy.');
  });
});
