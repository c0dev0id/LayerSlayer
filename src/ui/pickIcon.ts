import { createSignal } from 'solid-js';
import type { MapIcon } from '../model/icon';

/** A choice of icon asked of the user in the app's icon picker (IconPicker). */
export interface IconRequest {
  current?: MapIcon;
  /** The icon chosen, or undefined when the picker was closed without a choice. */
  resolve: (icon: MapIcon | undefined) => void;
}

const [iconRequest, setIconRequest] = createSignal<IconRequest>();
export { iconRequest };

/** Opens the icon picker; a request still open counts as closed without a choice. */
export function pickIcon(current?: MapIcon): Promise<MapIcon | undefined> {
  iconRequest()?.resolve(undefined);
  return new Promise((resolve) => setIconRequest({ ...(current && { current }), resolve }));
}

/** Answers the open request, if any. */
export function answerIconRequest(icon: MapIcon | undefined): void {
  const open = iconRequest();
  setIconRequest(undefined);
  open?.resolve(icon);
}
