import { describe, expect, it } from 'vitest';
import { createPump } from './pump';

describe('createPump', () => {
  /** A state with missing jobs, a result store and failures, like the route reconciler's. */
  function setup(missing: string[], failing: string[] = []) {
    const done = new Map<string, string>();
    const failed = new Set<string>();
    const requests: string[] = [];
    const waits: number[] = [];
    const pump = createPump<string>({
      next: () => missing.find((job) => !done.has(job) && !failed.has(job)),
      run: async (job) => {
        requests.push(job);
        if (failing.includes(job)) throw new Error('down');
        return `geometry of ${job}`;
      },
      onResult: (job, result) => done.set(job, result),
      onFailure: (job) => failed.add(job),
      wait: async (ms) => {
        waits.push(ms);
      },
      interval: 1100,
    });
    return { pump, done, failed, requests, waits, missing };
  }

  it('fetches every missing job once and pauses after each request', async () => {
    const s = setup(['a', 'b', 'c']);
    await s.pump();
    expect(s.requests).toEqual(['a', 'b', 'c']);
    expect([...s.done.keys()]).toEqual(['a', 'b', 'c']);
    expect(s.waits).toEqual([1100, 1100, 1100]);
  });

  it('marks failures instead of retrying them forever', async () => {
    const s = setup(['a', 'b'], ['a']);
    await s.pump();
    expect(s.requests).toEqual(['a', 'b']);
    expect(s.failed.has('a')).toBe(true);
    expect(s.done.has('b')).toBe(true);
  });

  it('ignores calls while running and picks up work added meanwhile', async () => {
    const s = setup(['a']);
    const first = s.pump();
    s.missing.push('b');
    await s.pump();
    await first;
    expect(s.requests).toEqual(['a', 'b']);
  });

  it('can run again after finishing', async () => {
    const s = setup(['a']);
    await s.pump();
    s.missing.push('b');
    await s.pump();
    expect(s.requests).toEqual(['a', 'b']);
  });
});
