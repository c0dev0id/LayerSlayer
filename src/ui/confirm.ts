import { createSignal } from 'solid-js';

/**
 * Yes-or-no questions asked in the app's own dialog (ConfirmDialog). The browser's
 * `confirm()` is not used: after a few, browsers offer to silence the page's dialogs, and
 * once silenced `confirm()` answers no without asking.
 */

export interface Question {
  message: string;
  /** The label of the button that goes ahead, naming what it does: Delete, Export. */
  action: string;
  resolve: (yes: boolean) => void;
}

const [question, setQuestion] = createSignal<Question>();
export { question };

/** Asks the question; true when the user goes ahead. A question still open counts as declined. */
export function askConfirmation(message: string, action: string): Promise<boolean> {
  question()?.resolve(false);
  return new Promise((resolve) => setQuestion({ message, action, resolve }));
}

/** Answers the open question, if any. */
export function answerConfirmation(yes: boolean): void {
  const open = question();
  setQuestion(undefined);
  open?.resolve(yes);
}
