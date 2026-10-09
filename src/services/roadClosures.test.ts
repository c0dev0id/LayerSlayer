import { describe, expect, it } from 'vitest';
import { parseClosureName, readClosure } from './roadClosures';

describe('parseClosureName', () => {
  it('reads postcode, conditions and places of a route closed both ways', () => {
    expect(parseClosureName('51766 Sa-So 0-24h Mo-Fr 17-24h -Remshagen -Bickenbach')).toEqual({
      country: 'Germany',
      postcode: '51766',
      when: 'Sa-So 0-24h Mo-Fr 17-24h',
      loud: false,
      places: ['Remshagen', 'Bickenbach'],
    });
  });

  it('reads the country of a prefixed postcode and the loud motorcycles', () => {
    expect(parseClosureName('A6460 15.4.-31.10. >95dB -Elmen -Imst')).toEqual({
      country: 'Austria',
      postcode: '6460',
      when: '15.4.-31.10.',
      loud: true,
      places: ['Elmen', 'Imst'],
    });
    expect(parseClosureName('Ch4716 So 9-16h -Gänsbrunnen -Oberdorf')).toMatchObject({ country: 'Switzerland', postcode: '4716' });
    expect(parseClosureName('NL3202 1.5.-1.10. Fr 22h - Mo 8h -Heenvliet -Spijkenisse')).toMatchObject({
      country: 'Netherlands',
      when: '1.5.-1.10. Fr 22h - Mo 8h',
      places: ['Heenvliet', 'Spijkenisse'],
    });
    expect(parseClosureName('B6880 1.5.-30.09. -Dohan -Mortehan')).toMatchObject({ country: 'Belgium' });
  });

  it('gives German postcodes back their leading zero', () => {
    expect(parseClosureName('1848 Sa-So -Hohnstein -Rathewalde')).toMatchObject({ postcode: '01848' });
  });

  it('keeps hyphens and spaces inside place names, and reads a closure without conditions as always', () => {
    expect(parseClosureName('64668 Sa 14h-So 24h -Zotzenbach -Wald-Michelbach')!.places).toEqual(['Zotzenbach', 'Wald-Michelbach']);
    expect(parseClosureName('CH1856 Mo-Fr -Corbeyrier -La Lécherette')!.places).toEqual(['Corbeyrier', 'La Lécherette']);
    expect(parseClosureName('35080 -Bottenhorn -Schlierbach')).toMatchObject({ when: '', places: ['Bottenhorn', 'Schlierbach'] });
    expect(parseClosureName('57413 1.4.-31.10. Sa-So -Hagen')!.places).toEqual(['Hagen']);
  });

  it('reads the names of the signs, which have no postcode', () => {
    expect(parseClosureName('15.4.- 31.10. >95dB -Bichlbach')).toEqual({ when: '15.4.- 31.10.', loud: true, places: ['Bichlbach'] });
    expect(parseClosureName('-Bieswang')).toEqual({ when: '', loud: false, places: ['Bieswang'] });
  });

  it('reads nothing from names without places', () => {
    expect(parseClosureName('Main Street')).toBeUndefined();
    expect(parseClosureName('Route 66 - west')).toBeUndefined();
  });
});

describe('readClosure', () => {
  it('takes routes by their postcode and signs by their icon', () => {
    expect(readClosure({ name: '56864 8-17h/19-6h -Bad Bertrich -Reil' })).toMatchObject({ postcode: '56864', allVehicles: false });
    expect(readClosure({ name: 'So -Eselsburg', icon: 'files/D_Verbot_Kfz.png' })).toMatchObject({ places: ['Eselsburg'], allVehicles: true });
    expect(readClosure({ name: 'Sa-So -Arnsberg', icon: 'files/D_Verbot_Motorrad.png' })).toMatchObject({ allVehicles: false });
  });

  it('reads closures for all motor vehicles from the description', () => {
    expect(readClosure({ name: 'CH6436 Sa-So -Pragelpass -Richisau', description: 'Sperrung für alle Kraftfahrzeuge' })).toMatchObject({ allVehicles: true });
  });

  it('leaves other features alone, even with a place-like name', () => {
    expect(readClosure({ name: 'Sa-So -Arnsberg' })).toBeUndefined();
    expect(readClosure({ name: 'Bakery' })).toBeUndefined();
    expect(readClosure({ title: '51766 -Remshagen' })).toBeUndefined();
  });
});
