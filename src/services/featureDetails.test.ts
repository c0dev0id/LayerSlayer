import { describe, expect, it } from 'vitest';
import { describeFeature, valueText } from './featureDetails';

describe('describeFeature', () => {
  it('titles a feature by its name and lists its other properties, without styling or empty ones', () => {
    expect(
      describeFeature({ name: 'Trailhead', ref: 12, open: '1', styleUrl: '#s', note: '', seasonal: true, opening: { from: 'May' } }, 'Trails'),
    ).toEqual({
      title: 'Trailhead',
      rows: [
        { label: 'ref', value: '12' },
        { label: 'seasonal', value: 'yes' },
        { label: 'opening', value: '{"from":"May"}' },
      ],
    });
  });

  it('titles a feature without a name by its layer', () => {
    expect(describeFeature({ NAME: '' , kind: 'gate' }, 'Barriers')).toEqual({ title: 'Barriers', rows: [{ label: 'kind', value: 'gate' }] });
    expect(describeFeature(null, 'Barriers')).toEqual({ title: 'Barriers', rows: [] });
  });

  it('reads a road closure from its name: both ways between its places', () => {
    expect(describeFeature({ name: 'A6460 15.4.-31.10. >95dB -Elmen -Imst', stroke: '#ff0000' }, 'Closures')).toEqual({
      title: 'Closed to motorcycles',
      subtitle: 'A6460 15.4.-31.10. >95dB -Elmen -Imst',
      rows: [
        { label: 'Closed', value: 'both ways, between Elmen and Imst' },
        { label: 'When', value: '15.4.-31.10.' },
        { label: 'Only', value: 'motorcycles louder than 95 dB standing noise' },
        { label: 'Postcode', value: '6460, Austria' },
      ],
    });
  });

  it('reads a closure one way, always, for all motor vehicles, with its note', () => {
    expect(describeFeature({ name: '58285 -Ennepetal', description: 'Sperrung für alle Kraftfahrzeuge' }, 'Closures')).toEqual({
      title: 'Closed to all motor vehicles',
      subtitle: '58285 -Ennepetal',
      rows: [
        { label: 'Closed', value: 'one way only, Ennepetal' },
        { label: 'When', value: 'always' },
        { label: 'Postcode', value: '58285, Germany' },
        { label: 'Note', value: 'Sperrung für alle Kraftfahrzeuge' },
      ],
    });
  });

  it('reads the sign at the end of a closure by its places only', () => {
    const sign = describeFeature({ name: 'Sa-So -Pragelpass', icon: 'files/CH_Verbot_Kfz.png', description: 'Sperrung für alle Kraftfahrzeuge,\n\nnicht an Feiertagen von Mo-Fr' }, 'Closures');
    expect(sign.title).toBe('Closed to all motor vehicles');
    expect(sign.rows).toEqual([
      { label: 'Place', value: 'Pragelpass' },
      { label: 'When', value: 'Sa-So' },
      { label: 'Note', value: 'Sperrung für alle Kraftfahrzeuge, nicht an Feiertagen von Mo-Fr' },
    ]);
  });
});

describe('valueText', () => {
  it('writes HTML as its text and joins lines', () => {
    expect(valueText('<p>Closed<br>in <b>winter</b></p>')).toBe('Closed in winter');
    expect(valueText('a\n\n b ')).toBe('a b');
    expect(valueText(0)).toBe('0');
    expect(valueText(undefined)).toBe('');
  });
});
