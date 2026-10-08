/**
 * Runs at most `max` tasks at a time; the rest wait in order. A waiting task whose signal
 * aborts leaves the queue without running, as the map aborts tiles that scrolled away.
 */
export function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve, reject) => {
        const start = () => {
          signal?.removeEventListener('abort', abort);
          resolve();
        };
        const abort = () => {
          waiting.splice(waiting.indexOf(start), 1);
          reject(signal!.reason);
        };
        waiting.push(start);
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
    signal?.throwIfAborted();
    active++;
    try {
      return await task();
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
}
