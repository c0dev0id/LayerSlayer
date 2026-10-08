import { createSignal } from 'solid-js';
import type { LayerIcon } from '../model/layer';

/** A choice of icon asked of the user in the app's icon picker (IconPicker). */
export interface IconRequest {
  current?: LayerIcon;
  /** The icon chosen, null for no icon, undefined when the picker was closed without a choice. */
  resolve: (choice: LayerIcon | null | undefined) => void;
}

const [iconRequest, setIconRequest] = createSignal<IconRequest>();
export { iconRequest };

/** Opens the icon picker; a request still open counts as closed without a choice. */
export function pickIcon(current?: LayerIcon): Promise<LayerIcon | null | undefined> {
  iconRequest()?.resolve(undefined);
  return new Promise((resolve) => setIconRequest({ ...(current && { current }), resolve }));
}

/** Answers the open request, if any. */
export function answerIconRequest(choice: LayerIcon | null | undefined): void {
  const open = iconRequest();
  setIconRequest(undefined);
  open?.resolve(choice);
}
