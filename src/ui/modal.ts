import { createEffect } from 'solid-js';

/** Shows a dialog as a modal while `open` holds, and closes it when it no longer does. */
export function showModalWhile(dialog: () => HTMLDialogElement, open: () => boolean): void {
  createEffect(() => {
    const element = dialog();
    if (open() && !element.open) element.showModal();
    else if (!open() && element.open) element.close();
  });
}

/** Shows a dialog beside the page, which stays usable, while `open` holds, and closes it when it no longer does. */
export function showWhile(dialog: () => HTMLDialogElement, open: () => boolean): void {
  createEffect(() => {
    const element = dialog();
    if (open() && !element.open) element.show();
    else if (!open() && element.open) element.close();
  });
}
