import { createStore, unwrap, type SetStoreFunction, type Store } from 'solid-js/store';

/**
 * A store kept in local storage under `key`: read at start (falling back when there is
 * nothing readable) and saved after every write through its setter. Writes made together,
 * in one action, are saved once.
 */
export function persistedStore<T extends object>(
  key: string,
  what: string,
  parse: (json: string) => T,
  fallback: () => T,
): [Store<T>, SetStoreFunction<T>] {
  let initial: T | undefined;
  try {
    const json = localStorage.getItem(key);
    if (json) initial = parse(json);
  } catch (error) {
    console.error(`The stored ${what} could not be read; starting afresh.`, error);
  }
  const [store, setStore] = createStore<T>(initial ?? fallback());
  let saving = false;
  const save = () => {
    saving = false;
    try {
      localStorage.setItem(key, JSON.stringify(unwrap(store)));
    } catch (error) {
      console.error(`Saving the ${what} failed.`, error);
    }
  };
  const set = ((...args: unknown[]) => {
    (setStore as (...args: unknown[]) => void)(...args);
    if (saving) return;
    saving = true;
    queueMicrotask(save);
  }) as SetStoreFunction<T>;
  return [store, set];
}

/** A value this browser keeps as a convenience; undefined when nothing is kept or storage cannot be read. */
export function readStored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Keeps a value in this browser, or forgets it for undefined. */
export function keepStored(key: string, value: string | undefined): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage the value lasts until the page is left.
  }
}
