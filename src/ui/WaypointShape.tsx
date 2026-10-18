import { createUniqueId, type JSX } from 'solid-js';
import type { WaypointType } from '../model/waypointType';

/** Height of a waypoint shape in CSS pixels at size 1, a little taller than a pin. */
const SHAPE_HEIGHT = 40;
const INK = '#343a40';
const POLE = '#868e96';
/** A flag's cloth, waving from the pole. */
const WAVE = 'M17 3.5 C21 1.5 25 5.5 31 3 L31 13 C25 15.5 21 11.5 17 13.5 Z';
/** Steam rising from a cup. */
const STEAM = 'q-1.6 -2 0 -4 q1.6 -2 0 -4';

/** A flag on a pole with its cloth. */
function Flag(props: { children: JSX.Element }) {
  return (
    <>
      <path d="M16 2 L16 34.5" stroke="#495057" stroke-width="1.8" stroke-linecap="round" />
      {props.children}
      <circle cx="16" cy="2" r="1.7" fill="#fab005" />
    </>
  );
}

/** The drawing of each type, in a 32 × 36 box with its foot at (16, 35); `id` makes its clip path unique. */
const DRAWINGS: Record<WaypointType, (id: string) => JSX.Element> = {
  start: () => (
    <Flag>
      <path d={WAVE} fill="#2f9e44" />
    </Flag>
  ),
  finish: (id) => (
    <Flag>
      <clipPath id={`cloth-${id}`}>
        <path d={WAVE} />
      </clipPath>
      <g clip-path={`url(#cloth-${id})`}>
        <rect x="17" y="0" width="14" height="17" fill="#fff" />
        {[0, 1, 2, 3, 4].flatMap((i) =>
          [0, 1, 2, 3, 4, 5].filter((j) => (i + j) % 2).map((j) => <rect x={17 + i * 2.8} y={j * 2.8} width="2.8" height="2.8" fill="#111" />),
        )}
      </g>
    </Flag>
  ),
  photo: () => (
    <>
      <g stroke={POLE} stroke-width="1.6" stroke-linecap="round">
        <path d="M16 21 L9.5 34.5" />
        <path d="M16 21 L22.5 34.5" />
        <path d="M16 21 L16 34.5" />
      </g>
      <rect x="14" y="18.5" width="4" height="3" rx="0.8" fill={INK} />
      <rect x="11" y="4" width="8" height="4" rx="1" fill={INK} />
      <rect x="4.5" y="6.5" width="23" height="13.5" rx="2.8" fill={INK} />
      <circle cx="16" cy="13.2" r="5.4" fill="#adb5bd" />
      <circle cx="16" cy="13.2" r="3.6" fill="#1c7ed6" />
      <circle cx="14.8" cy="12" r="1.1" fill="#fff" />
      <rect x="6.5" y="8.5" width="3.2" height="2" rx="0.5" fill="#fab005" />
      <circle cx="24.8" cy="9.4" r="1" fill="#fa5252" />
    </>
  ),
  meeting: () => (
    <>
      <rect x="15" y="18" width="2" height="17" rx="0.6" fill={POLE} />
      <rect x="4" y="2.5" width="24" height="16.5" rx="3" fill="#2b8a3e" />
      <g fill="#fff">
        <circle cx="10.6" cy="9.4" r="1.7" />
        <path d="M7.2 16.4 a3.4 3.4 0 0 1 6.8 0 Z" />
        <circle cx="21.4" cy="9.4" r="1.7" />
        <path d="M18 16.4 a3.4 3.4 0 0 1 6.8 0 Z" />
        <circle cx="16" cy="7.8" r="2.3" />
        <path d="M11.4 16.4 a4.6 4.6 0 0 1 9.2 0 Z" />
      </g>
    </>
  ),
  break: () => (
    <>
      <rect x="15" y="19" width="2" height="16" rx="0.6" fill={POLE} />
      <circle cx="16" cy="11" r="9.6" fill="#1971c2" />
      <circle cx="16" cy="11" r="8" fill="none" stroke="#fff" stroke-width="1" />
      <rect x="12" y="6.5" width="3" height="9" rx="0.8" fill="#fff" />
      <rect x="17" y="6.5" width="3" height="9" rx="0.8" fill="#fff" />
    </>
  ),
  food: () => (
    <>
      <circle cx="16" cy="24.5" r="10.3" fill="#fff" stroke="#ced4da" stroke-width="0.9" />
      <circle cx="16" cy="24.5" r="6.8" fill="#f8f9fa" stroke="#dee2e6" stroke-width="0.7" />
      <path d="M12.6 25.6 q3.4 -4.6 6.8 0 q-3.4 2.4 -6.8 0z" fill="#e8590c" />
      <circle cx="17.6" cy="22.8" r="1.2" fill="#2f9e44" />
      <g fill={POLE}>
        <rect x="2.3" y="14" width="1.6" height="20.5" rx="0.8" />
        <rect x="1" y="6" width="0.7" height="6" />
        <rect x="2.75" y="6" width="0.7" height="6" />
        <rect x="4.5" y="6" width="0.7" height="6" />
        <rect x="1" y="11" width="4.2" height="3.6" rx="1.4" />
        <path d="M28.6 6 C31 8.5 31 12.5 30.2 15.5 L28.6 15.5 Z" />
        <rect x="28.2" y="15" width="1.9" height="19.5" rx="0.9" />
      </g>
    </>
  ),
  drinks: () => (
    <>
      <ellipse cx="16" cy="33.2" rx="12.5" ry="2.3" fill="#fff" stroke="#ced4da" stroke-width="0.8" />
      <path d="M24.5 17.5 a4.6 4.6 0 0 1 0 9.2" fill="none" stroke="#e9ecef" stroke-width="2.6" />
      <path d="M6 14.5 L26 14.5 L24.4 29.2 Q24 32.3 21 32.3 L11 32.3 Q8 32.3 7.6 29.2 Z" fill="#fff" stroke="#ced4da" stroke-width="0.8" />
      <path d="M6.9 21 L25.1 21 L24.8 24 L7.2 24 Z" fill="#e03131" />
      <ellipse cx="16" cy="14.5" rx="10" ry="2.4" fill="#7b4a2b" stroke="#ced4da" stroke-width="0.8" />
      <g fill="none" stroke="#adb5bd" stroke-width="1.3" stroke-linecap="round">
        <path d={`M12 10.5 ${STEAM}`} />
        <path d={`M16 10.5 ${STEAM}`} />
        <path d={`M20 10.5 ${STEAM}`} />
      </g>
    </>
  ),
  fuel: () => (
    <>
      <path d="M23 11 C29 11 29.5 15 29.5 20 L29.5 23.5" fill="none" stroke={INK} stroke-width="1.8" />
      <rect x="28" y="22.5" width="3" height="5.5" rx="0.7" fill={INK} />
      <rect x="10" y="3.5" width="12" height="3.5" rx="1.2" fill="#c92a2a" />
      <rect x="9" y="6" width="14" height="26.5" rx="2.5" fill="#e03131" />
      <rect x="7.5" y="31" width="17" height="4" rx="1" fill={INK} />
      <rect x="11.5" y="9" width="9" height="7" rx="1" fill="#fff" />
      <rect x="13" y="11" width="6" height="1.2" fill={INK} />
      <rect x="13" y="13.3" width="4" height="1.2" fill={INK} />
      <path d="M16 19.5 c0 0 -3 3.5 -3 5.3 a3 3 0 0 0 6 0 c0 -1.8 -3 -5.3 -3 -5.3z" fill="#fff" />
    </>
  ),
  warning: () => (
    <>
      <rect x="15" y="20" width="2" height="15" rx="0.6" fill={POLE} />
      <path d="M16 2.2 L29.4 24.6 L2.6 24.6 Z" fill="#fcc419" stroke="#212529" stroke-width="2.2" stroke-linejoin="round" />
      <rect x="14.8" y="8.5" width="2.4" height="8.6" rx="1.1" fill="#111" />
      <circle cx="16" cy="20.2" r="1.4" fill="#111" />
    </>
  ),
  info: () => (
    <>
      <rect x="15" y="21" width="2" height="14" rx="0.6" fill={POLE} />
      <rect x="5" y="2.5" width="22" height="20" rx="3" fill="#1971c2" />
      <rect x="6.5" y="4" width="19" height="17" rx="2" fill="none" stroke="#fff" stroke-width="0.9" />
      <circle cx="16" cy="7.8" r="2" fill="#fff" />
      <path d="M13.6 11 h3.8 v6.6 h1.4 v1.6 h-5.6 v-1.6 h1.4 v-5 h-1 z" fill="#fff" />
    </>
  ),
};

/**
 * A waypoint drawn as the little object its type stands for, `scale` times its normal size,
 * its foot in the middle of its bottom edge. A white outline around the whole drawing sets it
 * off from any map.
 */
export function WaypointShape(props: { type: WaypointType; scale?: number }) {
  const id = createUniqueId();
  const height = () => SHAPE_HEIGHT * (props.scale ?? 1);
  return (
    <svg viewBox="-2 -1 36 36.5" height={height()} width={(height() * 36) / 36.5} aria-hidden="true">
      <filter id={`outline-${id}`} x="-10%" y="-10%" width="120%" height="120%">
        <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="grown" />
        <feFlood flood-color="#fff" />
        <feComposite in2="grown" operator="in" result="rim" />
        <feMerge>
          <feMergeNode in="rim" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <g filter={`url(#outline-${id})`}>{DRAWINGS[props.type](id)}</g>
    </svg>
  );
}
