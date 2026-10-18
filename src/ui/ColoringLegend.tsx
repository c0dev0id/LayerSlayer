import { For, Match, Show, Switch } from 'solid-js';
import type { Route } from '../model/route';
import { ELEVATION_RAMP, rainbowColor, SLOPE_CLASSES, SURFACES, type RouteColoring } from '../model/routeColoring';
import { coloringStatus, elevationSpan, retryColoring } from '../state/routeColoring';

const RAINBOW = [0, 0.25, 0.5, 0.75, 1].map(rainbowColor).join(', ');

const minus = (n: number) => String(n).replace('-', '−');

/** What the colours of a coloured route's line stand for, and whether their data is still being read. */
export function ColoringLegend(props: { route: Route; coloring: RouteColoring }) {
  const status = () => coloringStatus(props.route);
  const data = () => (props.coloring === 'surface' ? 'Surfaces' : 'Elevations');
  return (
    <div class="coloring-legend">
      <Switch>
        <Match when={props.coloring === 'rainbow'}>
          <div class="legend-bar" style={{ background: `linear-gradient(to right, ${RAINBOW})` }} />
          <div class="legend-ends muted">
            <span>Start</span>
            <span>End</span>
          </div>
        </Match>
        <Match when={props.coloring === 'elevation'}>
          <div class="legend-bar" style={{ background: `linear-gradient(to right, ${ELEVATION_RAMP.join(', ')})` }} />
          <Show when={elevationSpan(props.route)}>
            {(span) => (
              <div class="legend-ends muted">
                <span>{Math.round(span()[0])} m</span>
                <span>{Math.round(span()[1])} m</span>
              </div>
            )}
          </Show>
        </Match>
        <Match when={props.coloring === 'slope' || props.coloring === 'slope-reversed'}>
          <div class="legend-steps">
            <For each={SLOPE_CLASSES}>{(c) => <span style={{ background: c.color }} />}</For>
          </div>
          <div class="legend-ticks muted">
            <For each={SLOPE_CLASSES.slice(0, -1)}>{(c, i) => <span style={{ 'grid-column': i() + 2 }}>{minus(c.below)}</span>}</For>
          </div>
          <div class="muted">Grade in %, {props.coloring === 'slope' ? 'from the start to the end' : 'from the end to the start'}</div>
        </Match>
        <Match when={props.coloring === 'surface'}>
          <ul class="legend-surfaces">
            <For each={SURFACES}>
              {(surface) => (
                <li>
                  <span class="legend-swatch" style={{ background: surface.color }} />
                  {surface.name}
                </li>
              )}
            </For>
          </ul>
        </Match>
      </Switch>
      <Show when={status().reading}>
        <p class="muted hint">Reading {data().toLowerCase()}…</p>
      </Show>
      <Show when={status().failure}>
        {(reason) => (
          <div class="note error">
            {data()} could not be read: {reason()} <button onClick={() => retryColoring(props.route)}>Retry</button>
          </div>
        )}
      </Show>
    </div>
  );
}
