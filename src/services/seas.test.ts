import { describe, expect, it } from 'vitest';
import { readSea } from './seas';

const record = (MRGID: number, name: string, placeType = 'IHO Sea Area', lang = 'English') => ({
  MRGID,
  placeType,
  preferredGazetteerName: name,
  preferredGazetteerNameLang: lang,
});

describe('readSea', () => {
  it('names the IHO sea area in English, before the ocean it is part of', () => {
    const records = [
      record(3427, 'German Bight', 'Bight'),
      record(1912, 'North Atlantic Ocean'),
      record(2350, 'Noordzee', 'IHO Sea Area', 'Dutch'),
      record(2350, 'North Sea'),
      record(5664, 'North East Atlantic', 'General Sea Area'),
    ];
    expect(readSea(records)).toEqual({
      title: 'Sea',
      name: 'North Sea',
      alsoIn: ['North Atlantic Ocean'],
      url: 'https://www.marineregions.org/gazetteer.php?p=details&id=2350',
    });
  });

  it('calls an ocean an ocean', () => {
    expect(readSea([record(1904, 'Indian Ocean')])).toMatchObject({ title: 'Ocean', name: 'Indian Ocean', alsoIn: [] });
  });

  it('finds no sea on land or in what is no list of records', () => {
    expect(readSea([record(2, 'Germany', 'Nation')])).toBeUndefined();
    expect(readSea({ error: 'x' })).toBeUndefined();
  });
});
