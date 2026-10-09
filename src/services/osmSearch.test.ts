import { describe, expect, it } from 'vitest';
import { firstAnswer } from './osmSearch';

const fail = (reason: string) => () => Promise.reject(new Error(reason));

describe('firstAnswer', () => {
  it('takes the first source that answers', async () => {
    const asked: string[] = [];
    const answer = await firstAnswer([
      { name: 'Postpass', ask: () => (asked.push('Postpass'), Promise.resolve(1)) },
      { name: 'Overpass API', ask: () => (asked.push('Overpass API'), Promise.resolve(2)) },
    ]);
    expect(answer).toBe(1);
    expect(asked).toEqual(['Postpass']);
  });

  it('falls back to the next source, and names every reason when none answers', async () => {
    await expect(firstAnswer([{ name: 'Postpass', ask: fail('down') }, { name: 'Overpass API', ask: () => Promise.resolve(2) }])).resolves.toBe(2);
    await expect(firstAnswer([{ name: 'Postpass', ask: fail('down.') }, { name: 'Overpass API', ask: fail('busy.') }])).rejects.toThrow(
      'Postpass: down. Overpass API: busy.',
    );
  });
});
