import { createRenderEffect, createRoot, createSignal } from 'solid-js';
import { keepStored, readStored } from './persist';

/**
 * Light or dark interface. It follows the browser's preference, also as that changes,
 * until the toggle chooses the other theme; that choice is this browser's convenience,
 * kept in local storage rather than in projects. Choosing the browser's theme again
 * forgets the choice, so the interface follows the browser once more.
 */

export type Theme = 'light' | 'dark';

const THEME_KEY = 'layerslayer-theme';

/** A kept choice, or none for anything else. */
export function parseTheme(value: string | undefined): Theme | undefined {
  return value === 'light' || value === 'dark' ? value : undefined;
}

export const otherTheme = (theme: Theme): Theme => (theme === 'dark' ? 'light' : 'dark');

/** The choice to keep when the toggle turns `current` into the other theme: none when that is the browser's. */
export function toggledChoice(current: Theme, preferred: Theme): Theme | undefined {
  const next = otherTheme(current);
  return next === preferred ? undefined : next;
}

const query = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
const [preferred, setPreferred] = createSignal<Theme>(query?.matches ? 'dark' : 'light');
query?.addEventListener('change', (e) => setPreferred(e.matches ? 'dark' : 'light'));

const [chosen, setChosen] = createSignal(parseTheme(readStored(THEME_KEY)));

/** The theme the interface shows. */
export const theme = (): Theme => chosen() ?? preferred();

export function toggleTheme(): void {
  const choice = toggledChoice(theme(), preferred());
  setChosen(choice);
  keepStored(THEME_KEY, choice);
}

// The stylesheet reads the theme from the root element.
createRoot(() => createRenderEffect(() => (document.documentElement.dataset['theme'] = theme())));
