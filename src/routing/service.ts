import { createEffect, createMemo, createRoot, createSignal } from 'solid-js';
import { unwrap } from 'solid-js/store';
import { editingRouteId } from '../state/drawing';
import { routeData, setRouteLeg } from '../state/routes';
import { errorMessage } from '../state/ui';
import { legState, nextMissingLeg, routeLegs, type LegJob } from './legs';
import { createPump, fetchLeg, ROUTING_MIN_INTERVAL_MS } from './osrm';

const [failedLegs, setFailedLegs] = createSignal<ReadonlySet<string>>(new Set());
const [lastError, setLastError] = createSignal<string>();

/** Keys of legs whose routing failed in this session (drawn as red dashed lines). */
export { failedLegs, lastError };

/** Clears the failures so the pump tries those legs again. */
export function retryFailedLegs(): void {
  setLastError(undefined);
  setFailedLegs(new Set<string>());
}

const pump = createPump<LegJob>({
  next: () => nextMissingLeg(unwrap(routeData.routes), failedLegs(), editingRouteId()),
  run: (job) => fetchLeg(job),
  onResult: (job, geometry) => setRouteLeg(job.routeId, job.key, geometry),
  onFailure: (job, error) => {
    setLastError(errorMessage(error));
    setFailedLegs((failed) => new Set(failed).add(job.key));
  },
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  interval: ROUTING_MIN_INTERVAL_MS,
});

const service = createRoot(() => {
  // Of the legs the routes have now; a failed leg whose point moved is no longer counted.
  const counts = createMemo(() => {
    const failed = failedLegs();
    const count = { pending: 0, failed: 0 };
    for (const route of routeData.routes) {
      for (const leg of routeLegs(route)) {
        const state = legState(route, leg, failed);
        if (state === 'pending' || state === 'failed') count[state]++;
      }
    }
    return count;
  });
  // Tracks route points, profiles, cached legs and failures; starts the pump when work appears.
  createEffect(() => {
    if (counts().pending > 0) void pump();
  });
  return { counts };
});

/** Number of legs still waiting for routing. */
export const pendingLegs = () => service.counts().pending;

/** Number of legs whose routing failed. */
export const failedLegCount = () => service.counts().failed;
