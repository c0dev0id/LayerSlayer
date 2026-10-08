import { describe, expect, it } from 'vitest';
import { createLimiter } from './limit';

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};

describe('createLimiter', () => {
  it('runs at most the given number of tasks at once, the rest in order', async () => {
    const run = createLimiter(2);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const done = gates.map((gate, i) =>
      run(async () => {
        started.push(i);
        await gate.promise;
        return i;
      }),
    );
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    gates[0]!.resolve();
    await done[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);
    gates[1]!.resolve();
    gates[2]!.resolve();
    expect(await Promise.all(done)).toEqual([0, 1, 2]);
  });

  it('drops a waiting task whose signal aborts', async () => {
    const run = createLimiter(1);
    const gate = deferred();
    const first = run(() => gate.promise);
    const controller = new AbortController();
    let ran = false;
    const second = run(async () => {
      ran = true;
    }, controller.signal);
    controller.abort();
    await expect(second).rejects.toBeDefined();
    gate.resolve();
    await first;
    expect(ran).toBe(false);
  });
});
