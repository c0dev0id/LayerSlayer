// Shapes from or composed of Tabler Icons (https://tabler.io/icons).
// Copyright (c) 2020-2026 Paweł Kuna, MIT License: see tabler-icons-license.txt.
import { For, Show, type JSX } from 'solid-js';
import type { MapIcon } from '../model/icon';

/** Line icons on Tabler's 24 × 24 grid, drawn in the text colour. */
function Icon(props: { children: JSX.Element }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {props.children}
    </svg>
  );
}

/** Shown (Tabler's eye). */
export const EyeIcon = () => (
  <Icon>
    <path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6" />
  </Icon>
);

/** Hidden (Tabler's eye-off). */
export const EyeOffIcon = () => (
  <Icon>
    <path d="M10.585 10.587a2 2 0 0 0 2.829 2.828" />
    <path d="M16.681 16.673a8.717 8.717 0 0 1 -4.681 1.327c-3.6 0 -6.6 -2 -9 -6c1.272 -2.12 2.712 -3.678 4.32 -4.674m2.86 -1.146a9.055 9.055 0 0 1 1.82 -.18c3.6 0 6.6 2 9 6c-.666 1.11 -1.379 2.067 -2.138 2.87" />
    <path d="M3 3l18 18" />
  </Icon>
);

/** A handle to drag a list item (Tabler's grip-vertical). */
export const GripIcon = () => (
  <Icon>
    <path d="M8 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M8 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M8 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M14 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M14 19a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
  </Icon>
);

/** Fly to a layer's area: the corners of a frame (Tabler's maximize). */
export const AreaIcon = () => (
  <Icon>
    <path d="M4 8v-2a2 2 0 0 1 2 -2h2" />
    <path d="M4 16v2a2 2 0 0 0 2 2h2" />
    <path d="M16 4h2a2 2 0 0 1 2 2v2" />
    <path d="M16 20h2a2 2 0 0 0 2 -2v-2" />
  </Icon>
);

/** Something went wrong (Tabler's alert-triangle). */
export const AlertIcon = () => (
  <Icon>
    <path d="M12 9v4" />
    <path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />
    <path d="M12 16h.01" />
  </Icon>
);

/** Close or remove (Tabler's x). */
export const CloseIcon = () => (
  <Icon>
    <path d="M18 6l-12 12" />
    <path d="M6 6l12 12" />
  </Icon>
);

/** Search (Tabler's search). */
export const SearchIcon = () => (
  <Icon>
    <path d="M3 10a7 7 0 1 0 14 0a7 7 0 1 0 -14 0" />
    <path d="M21 21l-6 -6" />
  </Icon>
);

/** Undo (Tabler's arrow-back-up). */
export const UndoIcon = () => (
  <Icon>
    <path d="M9 14l-4 -4l4 -4" />
    <path d="M5 10h11a4 4 0 1 1 0 8h-1" />
  </Icon>
);

/** Redo (Tabler's arrow-forward-up). */
export const RedoIcon = () => (
  <Icon>
    <path d="M15 14l4 -4l-4 -4" />
    <path d="M19 10h-11a4 4 0 1 0 0 8h1" />
  </Icon>
);

/** Append route points: a line of points with a plus at its end. */
export const AppendIcon = () => (
  <Icon>
    <circle cx="4" cy="20" r="2" />
    <path d="M5.5 18.5l3 -3" />
    <circle cx="10" cy="14" r="2" />
    <path d="M17.5 2.5v8" />
    <path d="M13.5 6.5h8" />
  </Icon>
);

/** Reach new points by routing: a winding path between two points (Tabler's route). */
export const RouteIcon = () => (
  <Icon>
    <path d="M3 19a2 2 0 1 0 4 0a2 2 0 0 0 -4 0" />
    <path d="M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4" />
    <path d="M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5" />
  </Icon>
);

/** Reach new points by a straight line (Tabler's line). */
export const LineIcon = () => (
  <Icon>
    <path d="M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M16 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
    <path d="M7.5 16.5l9 -9" />
  </Icon>
);

/** Insert a route point: a line between two points with a plus in its middle. */
export const InsertIcon = () => (
  <Icon>
    <circle cx="4" cy="20" r="2" />
    <circle cx="20" cy="4" r="2" />
    <path d="M5.5 18.5l2 -2" />
    <path d="M16.5 7.5l2 -2" />
    <path d="M12 8v8" />
    <path d="M8 12h8" />
  </Icon>
);

/** Add a waypoint: a map pin with a plus (Tabler's map-pin-plus). */
export const WaypointIcon = () => (
  <Icon>
    <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    <path d="M12.794 21.322a2 2 0 0 1 -2.207 -.422l-4.244 -4.243a8 8 0 1 1 13.59 -4.616" />
    <path d="M16 19h6" />
    <path d="M19 16v6" />
  </Icon>
);

/** Delete (Tabler's trash). */
export const DeleteIcon = () => (
  <Icon>
    <path d="M4 7l16 0" />
    <path d="M10 11l0 6" />
    <path d="M14 11l0 6" />
    <path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12" />
    <path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3" />
  </Icon>
);

/** Rename (Tabler's pencil). */
export const PencilIcon = () => (
  <Icon>
    <path d="M4 20h4l10.5 -10.5a2.828 2.828 0 1 0 -4 -4l-10.5 10.5v4" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

/** The map pin of a waypoint; its tip marks the place. */
export function WaypointPin(props: { icon?: MapIcon | undefined }) {
  return (
    <svg viewBox="0 0 22 28" width="22" height="28" aria-hidden="true">
      <path
        d="M11 27s-9.5-9.2-9.5-15.6a9.5 9.5 0 0 1 19 0C20.5 17.8 11 27 11 27z"
        fill="#c92a2a"
        stroke="#fff"
        stroke-width="1.5"
      />
      <Show when={props.icon} fallback={<circle cx="11" cy="11" r="3.5" fill="#fff" />}>
        {(icon) => (
          <svg x="5.5" y="5.5" width="11" height="11" viewBox={`0 0 ${icon().size[0]} ${icon().size[1]}`} fill="#fff">
            <For each={icon().paths}>{(d) => <path d={d} />}</For>
          </svg>
        )}
      </Show>
    </svg>
  );
}
