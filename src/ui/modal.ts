import { createEffect } from 'solid-js';

/** Shows a dialog as a modal while `open` holds, and closes it when it no longer does. */
export function showModalWhile(dialog: () => HTMLDialogElement, open: () => boolean): void {
  createEffect(() => {
    const element = dialog();
    if (open() && !element.open) element.showModal();
    else if (!open() && element.open) element.close();
  });
}
