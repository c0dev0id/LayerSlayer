// Shapes from or composed of Tabler Icons (https://tabler.io/icons).
// Copyright (c) 2020-2026 Paweł Kuna, MIT License: see tabler-icons-license.txt.
import { For, Show, splitProps, type JSX } from 'solid-js';
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

/** The light theme (Tabler's sun). */
export const SunIcon = () => (
  <Icon>
    <path d="M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0 -8 0" />
    <path d="M3 12h1m8 -9v1m8 8h1m-9 8v1m-6.4 -15.4l.7 .7m12.1 -.7l-.7 .7m0 11.4l.7 .7m-12.1 -.7l-.7 .7" />
  </Icon>
);

/** The dark theme (Tabler's moon). */
export const MoonIcon = () => (
  <Icon>
    <path d="M12 3c.132 0 .263 0 .393 0a7.5 7.5 0 0 0 7.92 12.446a9 9 0 1 1 -8.313 -12.454z" />
  </Icon>
);

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

/** Download (Tabler's download). */
export const DownloadIcon = () => (
  <Icon>
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
    <path d="M7 11l5 5l5 -5" />
    <path d="M12 4l0 12" />
  </Icon>
);

/**
 * A link that downloads a file from its server, which needs no CORS where the page itself
 * may not read the file; in a new tab, in case the browser shows the file instead.
 */
export function DownloadLink(props: { href: string; of: string; class?: string }) {
  return (
    <a class={`icon ${props.class ?? ''}`} href={props.href} target="_blank" rel="noopener" title="Download the file" aria-label={`Download the file of ${props.of}`}>
      <DownloadIcon />
    </a>
  );
}

/** Fold up (Tabler's chevron-down): the panel under the map goes down out of the way. */
export const ChevronDownIcon = () => (
  <Icon>
    <path d="M6 9l6 6l6 -6" />
  </Icon>
);

/** Unfold (Tabler's chevron-up). */
export const ChevronUpIcon = () => (
  <Icon>
    <path d="M6 15l6 -6l6 6" />
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

/** A road (Tabler's road). */
export const RoadIcon = () => (
  <Icon>
    <path d="M4 19l4 -14" />
    <path d="M16 5l4 14" />
    <path d="M12 8v-2" />
    <path d="M12 13v-2" />
    <path d="M12 18v-2" />
  </Icon>
);

/** A speed limit (Tabler's gauge). */
export const GaugeIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />
    <path d="M11 12a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M13.41 10.59l2.59 -2.59" />
    <path d="M7 12a5 5 0 0 1 5 -5" />
  </Icon>
);

/** One way (Tabler's arrow-narrow-right). */
export const OneWayIcon = () => (
  <Icon>
    <path d="M5 12l14 0" />
    <path d="M15 16l4 -4" />
    <path d="M15 8l4 4" />
  </Icon>
);

/** Both ways (Tabler's arrows-left-right). */
export const BothWaysIcon = () => (
  <Icon>
    <path d="M21 17l-18 0" />
    <path d="M6 10l-3 -3l3 -3" />
    <path d="M3 7l18 0" />
    <path d="M18 20l3 -3l-3 -3" />
  </Icon>
);

/** A surface (Tabler's texture). */
export const TextureIcon = () => (
  <Icon>
    <path d="M6 3l-3 3" />
    <path d="M21 18l-3 3" />
    <path d="M11 3l-8 8" />
    <path d="M16 3l-13 13" />
    <path d="M21 3l-18 18" />
    <path d="M21 8l-13 13" />
    <path d="M21 13l-8 8" />
  </Icon>
);

/** A track grade (Tabler's mountain). */
export const MountainIcon = () => (
  <Icon>
    <path d="M3 20h18l-6.921 -14.612a2.3 2.3 0 0 0 -4.158 0l-6.921 14.612" />
    <path d="M7.5 11l2 2.5l2.5 -2.5l2 3l2.5 -2" />
  </Icon>
);

/** Smoothness (Tabler's wave-sine). */
export const WaveIcon = () => (
  <Icon>
    <path d="M21 12h-2c-.894 0 -1.662 -.857 -1.761 -2c-.296 -3.45 -.749 -6 -2.749 -6s-2.5 3.582 -2.5 8s-.5 8 -2.5 8s-2.452 -2.547 -2.749 -6c-.1 -1.147 -.867 -2 -1.763 -2h-2" />
  </Icon>
);

/** A width (Tabler's ruler-measure). */
export const RulerIcon = () => (
  <Icon>
    <path d="M19.875 12c.621 0 1.125 .512 1.125 1.143v5.714c0 .631 -.504 1.143 -1.125 1.143h-15.875a1 1 0 0 1 -1 -1v-5.857c0 -.631 .504 -1.143 1.125 -1.143h15.75" />
    <path d="M9 12v2" />
    <path d="M6 12v3" />
    <path d="M12 12v3" />
    <path d="M18 12v3" />
    <path d="M15 12v2" />
    <path d="M3 3v4" />
    <path d="M3 5h18" />
    <path d="M21 3v4" />
  </Icon>
);

/** Access (Tabler's key). */
export const KeyIcon = () => (
  <Icon>
    <path d="M16.555 3.843l3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1 -4.069 0l-.301 -.301l-6.558 6.558a2 2 0 0 1 -1.239 .578l-.175 .008h-1.172a1 1 0 0 1 -.993 -.883l-.007 -.117v-1.172a2 2 0 0 1 .467 -1.284l.119 -.13l.414 -.414h2v-2h2v-2l2.144 -2.144l-.301 -.301a2.877 2.877 0 0 1 0 -4.069l2.643 -2.643a2.877 2.877 0 0 1 4.069 0" />
    <path d="M15 9h.01" />
  </Icon>
);

/** Locked (Tabler's lock). */
export const LockIcon = () => (
  <Icon>
    <path d="M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6" />
    <path d="M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
    <path d="M8 11v-4a4 4 0 1 1 8 0v4" />
  </Icon>
);

/** An address or place (Tabler's map-pin). */
export const MapPinIcon = () => (
  <Icon>
    <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0 -6 0" />
    <path d="M17.657 16.657l-4.243 4.243a2 2 0 0 1 -2.827 0l-4.244 -4.243a8 8 0 1 1 11.314 0" />
  </Icon>
);

/** A phone number (Tabler's phone). */
export const PhoneIcon = () => (
  <Icon>
    <path d="M5 4h4l2 5l-2.5 1.5a11 11 0 0 0 5 5l1.5 -2.5l5 2v4a2 2 0 0 1 -2 2a16 16 0 0 1 -15 -15a2 2 0 0 1 2 -2" />
  </Icon>
);

/** A website (Tabler's world). */
export const WorldIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <path d="M3.6 9h16.8" />
    <path d="M3.6 15h16.8" />
    <path d="M11.5 3a17 17 0 0 0 0 18" />
    <path d="M12.5 3a17 17 0 0 1 0 18" />
  </Icon>
);

/** Opening hours (Tabler's clock). */
export const ClockIcon = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 18 0a9 9 0 0 0 -18 0" />
    <path d="M12 7v5l3 3" />
  </Icon>
);

/** A reference number (Tabler's tag). */
export const TagIcon = () => (
  <Icon>
    <path d="M6.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0" />
    <path d="M3 6v5.172a2 2 0 0 0 .586 1.414l7.71 7.71a2.41 2.41 0 0 0 3.408 0l5.592 -5.592a2.41 2.41 0 0 0 0 -3.408l-7.71 -7.71a2 2 0 0 0 -1.414 -.586h-5.172a3 3 0 0 0 -3 3" />
  </Icon>
);

/** A barrier (Tabler's barrier-block). */
export const BarrierIcon = () => (
  <Icon>
    <path d="M4 8a1 1 0 0 1 1 -1h14a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-14a1 1 0 0 1 -1 -1l0 -7" />
    <path d="M7 16v4" />
    <path d="M7.5 16l9 -9" />
    <path d="M13.5 16l6.5 -6.5" />
    <path d="M4 13.5l6.5 -6.5" />
    <path d="M17 16v4" />
    <path d="M5 20h4" />
    <path d="M15 20h4" />
    <path d="M17 7v-2" />
    <path d="M7 7v-2" />
  </Icon>
);

/** How wide a waypoint pin is drawn at size 1, in CSS pixels. */
const PIN_WIDTH = 27;

/** The map pin of a waypoint, `scale` times its normal size; its tip marks the place. */
export function WaypointPin(props: { icon?: MapIcon | undefined; scale?: number }) {
  const width = () => PIN_WIDTH * (props.scale ?? 1);
  return (
    <svg viewBox="0 0 22 28" width={width()} height={(width() * 28) / 22} aria-hidden="true">
      <path
        d="M11 27s-9.5-9.2-9.5-15.6a9.5 9.5 0 0 1 19 0C20.5 17.8 11 27 11 27z"
        fill="#c92a2a"
        stroke="#fff"
        stroke-width="1.5"
      />
      <Show when={props.icon} fallback={<circle cx="11" cy="11" r="3.5" fill="#fff" />}>
        {(icon) => <IconGlyph icon={icon()} class="pin-glyph" x="5.5" y="5.5" width="11" height="11" fill="#fff" />}
      </Show>
    </svg>
  );
}

/** An icon of the icon sets in an <svg> of its viewBox, filled in the text colour unless given a fill. */
export function IconGlyph(props: { icon: MapIcon } & JSX.SvgSVGAttributes<SVGSVGElement>) {
  const [local, attributes] = splitProps(props, ['icon']);
  return (
    <svg class="glyph" aria-hidden="true" {...attributes} viewBox={`0 0 ${local.icon.size[0]} ${local.icon.size[1]}`}>
      <For each={local.icon.paths}>{(d) => <path d={d} />}</For>
    </svg>
  );
}

/** An icon as the map shows it on a layer: white on a disc of the layer's colour. */
export function IconBadge(props: { icon: MapIcon; color: string }) {
  return (
    <span class="badge-disc" style={{ 'background-color': props.color }} title={props.icon.id}>
      <IconGlyph icon={props.icon} />
    </span>
  );
}
