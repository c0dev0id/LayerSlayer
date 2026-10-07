// Shapes from Tabler Icons (https://tabler.io/icons).
// Copyright (c) 2020-2026 Paweł Kuna, MIT License: see tabler-icons-license.txt.
import type { JSX } from 'solid-js';

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
