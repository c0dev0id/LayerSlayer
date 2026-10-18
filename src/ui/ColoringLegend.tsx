import { createMemo, For, Match, Show, Switch } from 'solid-js';
import type { Route } from '../model/route';
import { dataOf, elevationColor, rainbowColor, SLOPE_CLASSES, SURFACES } from '../model/routeColoring';
import { OSM_CREDIT } from '../services/osm';
import { coloringStatus, elevationSpan, retryColoring } from '../state/routeColoring';

/** A bar running through a colour scale from its start to its end. */
const gradient = (color: (t: number) => string) => `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(color).join(', ')})`;

const minus = (n: number) => String(n).replace('-', '−');

/** What the colours of a coloured route's line stand for, where their data comes from, and whether it is still being read. */
export function ColoringLegend(props: { route: Route }) {
  const status = createMemo(() => coloringStatus(props.route));
  const reads = () => dataOf(props.route.coloring);
  const slope = () => props.route.coloring === 'slope' || props.route.coloring === 'slope-reversed';
  return (
    <div class="coloring-legend">
      <Switch>
        <Match when={props.route.coloring === 'rainbow'}>
          <div class="legend-bar" style={{ background: gradient(rainbowColor) }} />
          <div class="legend-ends muted">
            <span>Start</span>
            <span>End</span>
          </div>
        </Match>
        <Match when={props.route.coloring === 'elevation'}>
          <div class="legend-bar" style={{ background: gradient(elevationColor) }} />
          <Show when={elevationSpan(props.route)}>
            {(span) => (
              <div class="legend-ends muted">
                <span>{Math.round(span()[0])} m</span>
                <span>{Math.round(span()[1])} m</span>
              </div>
            )}
          </Show>
        </Match>
        <Match when={slope()}>
          <div class="legend-steps">
            <For each={SLOPE_CLASSES}>{(c) => <span style={{ background: c.color }} />}</For>
          </div>
          <div class="legend-ticks muted">
            <For each={SLOPE_CLASSES.slice(0, -1)}>{(c, i) => <span style={{ 'grid-column': i() + 2 }}>{minus(c.below)}</span>}</For>
          </div>
          <div class="muted">Grade in %, {props.route.coloring === 'slope' ? 'from the start to the end' : 'from the end to the start'}</div>
        </Match>
        <Match when={props.route.coloring === 'surface'}>
          <ul class="legend-surfaces">
            <For each={SURFACES}>
              {(surface) => (
                <li>
                  <span class="color-chip" style={{ background: surface.color }} />
                  {surface.name}
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
      <Show when={status().reading}>
        <p class="muted hint">Reading {reads() === 'surface' ? 'surfaces' : 'elevations'}…</p>
      </Show>
      <Show when={status().failure}>
        {(reason) => (
          <div class="note error">
            {reads() === 'surface' ? 'Surfaces' : 'Elevations'} could not be read: {reason()} <button onClick={() => retryColoring(props.route)}>Retry</button>
          </div>
        )}
      </Show>
      <Switch>
        <Match when={reads() === 'elevation'}>
          <p class="muted hint">
            Elevation ©{' '}
            <a href="https://mapterhorn.com/attribution" target="_blank" rel="noopener">
              Mapterhorn
            </a>
          </p>
        </Match>
        <Match when={reads() === 'surface'}>
          <p class="muted hint">{OSM_CREDIT}</p>
        </Match>
      </Switch>
    </div>
  );
}
