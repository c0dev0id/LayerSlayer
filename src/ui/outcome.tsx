import { createSignal, Show } from 'solid-js';
import { errorMessage } from '../state/ui';

/** What came of an action: a message, or the error it failed with. */
export interface Outcome {
  text: string;
  error?: boolean;
}

/** Runs actions that end in a message, keeping the message (or the error) for OutcomeNote, and whether one is running. */
export function createOutcome() {
  const [outcome, setOutcome] = createSignal<Outcome>();
  const [running, setRunning] = createSignal(false);
  async function run(action: () => Promise<string>): Promise<void> {
    setRunning(true);
    setOutcome(undefined);
    try {
      setOutcome({ text: await action() });
    } catch (error) {
      setOutcome({ text: errorMessage(error), error: true });
    } finally {
      setRunning(false);
    }
  }
  return { outcome, running, run };
}

export function OutcomeNote(props: { outcome: Outcome | undefined }) {
  return <Show when={props.outcome}>{(o) => <p class="note" classList={{ error: !!o().error, info: !o().error }}>{o().text}</p>}</Show>;
}
