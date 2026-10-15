import { createSignal, Show, type JSX } from 'solid-js';
import { CheckIcon, CopyIcon } from './icons';

/** Copying a text to the clipboard, and whether it was copied a moment ago. */
function createCopy(text: () => string) {
  const [copied, setCopied] = createSignal(false);
  const copy = () =>
    navigator.clipboard
      ?.writeText(text())
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {});
  return { copied, copy };
}

/** A button that copies a text to the clipboard and shows a tick for a moment. */
export function CopyButton(props: { text: string; label: string }) {
  const { copied, copy } = createCopy(() => props.text);
  return (
    <button class="icon copy" title={copied() ? 'Copied' : props.label} aria-label={props.label} onClick={() => void copy()}>
      <Show when={copied()} fallback={<CopyIcon />}>
        <CheckIcon />
      </Show>
    </button>
  );
}

/** Text on one line, cut short where it does not fit, that copies `text` when clicked and shows a tick for a moment. */
export function CopyText(props: { text: string; label: string; children: JSX.Element }) {
  const { copied, copy } = createCopy(() => props.text);
  return (
    <button class="copy-text grow" title={`${props.text}\n${copied() ? 'Copied' : 'Click to copy'}`} aria-label={props.label} onClick={() => void copy()}>
      <span class="name">{props.children}</span>
      <Show when={copied()}>
        <CheckIcon />
      </Show>
    </button>
  );
}
