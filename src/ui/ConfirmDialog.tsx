import { createEffect, Show } from 'solid-js';
import { answerConfirmation, question } from './confirm';

/** The open yes-or-no question, in a modal dialog of the page: Esc or Cancel declines. */
export function ConfirmDialog() {
  let dialog!: HTMLDialogElement;
  createEffect(() => {
    const open = question() !== undefined;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  });
  return (
    <dialog ref={dialog} class="dialog form-dialog" aria-label="Confirm" onClose={() => answerConfirmation(false)}>
      <Show when={question()}>
        {(open) => (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              answerConfirmation(true);
            }}
          >
            <p class="question">{open().message}</p>
            <div class="row end">
              <button type="button" onClick={() => answerConfirmation(false)}>
                Cancel
              </button>
              <button type="submit" class="primary" autofocus>
                {open().action}
              </button>
            </div>
          </form>
        )}
      </Show>
    </dialog>
  );
}
