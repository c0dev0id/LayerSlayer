interface Entry<T> {
  state: T;
  label: string;
}

/**
 * Undo/redo stacks of states taken before each edit. Edits of one gesture, such as a
 * slider being dragged, make one step: recorded with the same `gesture` key until
 * `endGesture`, only the first is kept.
 */
export class History<T> {
  private past: Entry<T>[] = [];
  private future: Entry<T>[] = [];
  private gesture: string | undefined;

  constructor(private readonly limit = 100) {}

  /** Whether an edit of `gesture` joins the step its gesture already recorded. */
  continues(gesture: string | undefined): boolean {
    return gesture !== undefined && gesture === this.gesture;
  }

  /** Records the state before an edit; a new edit discards what could be redone. */
  record(before: T, label: string, gesture?: string): void {
    if (this.continues(gesture)) return;
    this.gesture = gesture;
    this.future = [];
    this.past.push({ state: before, label });
    if (this.past.length > this.limit) this.past.shift();
  }

  /** Returns the state to go back to, or undefined if there is nothing to undo. */
  undo(current: T): T | undefined {
    this.gesture = undefined;
    const entry = this.past.pop();
    if (!entry) return undefined;
    this.future.push({ state: current, label: entry.label });
    return entry.state;
  }

  /** Returns the state to go forward to, or undefined if there is nothing to redo. */
  redo(current: T): T | undefined {
    this.gesture = undefined;
    const entry = this.future.pop();
    if (!entry) return undefined;
    this.past.push({ state: current, label: entry.label });
    return entry.state;
  }

  clear(): void {
    this.past = [];
    this.future = [];
    this.gesture = undefined;
  }

  /** Ends a gesture: its next edit is a step of its own. */
  endGesture(): void {
    this.gesture = undefined;
  }

  get undoLabel(): string | undefined {
    return this.past.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.future.at(-1)?.label;
  }
}
