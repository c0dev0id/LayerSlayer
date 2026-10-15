import { createSignal, Show } from 'solid-js';
import { CheckIcon, CopyIcon } from './icons';

/** A button that copies a text to the clipboard and shows a tick for a moment. */
export function CopyButton(props: { text: string; label: string }) {
  const [copied, setCopied] = createSignal(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(props.text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  return (
    <button class="icon copy" title={copied() ? 'Copied' : props.label} aria-label={props.label} onClick={() => void copy()}>
      <Show when={copied()} fallback={<CopyIcon />}>
        <CheckIcon />
      </Show>
    </button>
  );
}
