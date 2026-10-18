export interface PumpDeps<Job, Result = string> {
  /** The next job from the current state, or undefined when nothing is missing. */
  next(): Job | undefined;
  run(job: Job): Promise<Result>;
  onResult(job: Job, result: Result): void;
  onFailure(job: Job, error: unknown): void;
  wait(ms: number): Promise<void>;
  /** Pause after every run, in milliseconds. */
  interval: number;
}

/**
 * A pull-based request loop: each iteration asks the current state for the next missing
 * job, so nothing stale is ever queued. Calling the pump while it runs does nothing; the
 * running loop picks up new work after its pause.
 */
export function createPump<Job, Result = string>(deps: PumpDeps<Job, Result>): () => Promise<void> {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      for (let job = deps.next(); job !== undefined; job = deps.next()) {
        try {
          deps.onResult(job, await deps.run(job));
        } catch (error) {
          deps.onFailure(job, error);
        }
        await deps.wait(deps.interval);
      }
    } finally {
      running = false;
    }
  };
}
