import { describe, expect, it } from 'vitest';
import { History } from './history';

describe('History', () => {
  it('undoes and redoes in order', () => {
    const history = new History<number>();
    history.record(0, 'one');
    history.record(1, 'two');
    expect(history.undoLabel).toBe('two');
    expect(history.undo(2)).toBe(1);
    expect(history.undo(1)).toBe(0);
    expect(history.undo(0)).toBeUndefined();
    expect(history.redoLabel).toBe('one');
    expect(history.redo(0)).toBe(1);
    expect(history.redo(1)).toBe(2);
    expect(history.redo(2)).toBeUndefined();
    expect(history.undoLabel).toBe('two');
  });

  it('drops the redo stack when a new edit is recorded', () => {
    const history = new History<number>();
    history.record(0, 'one');
    history.undo(1);
    history.record(0, 'other');
    expect(history.redoLabel).toBeUndefined();
    expect(history.undo(5)).toBe(0);
  });

  it('keeps at most the configured number of steps', () => {
    const history = new History<number>(2);
    history.record(0, 'a');
    history.record(1, 'b');
    history.record(2, 'c');
    expect(history.undo(3)).toBe(2);
    expect(history.undo(2)).toBe(1);
    expect(history.undo(1)).toBeUndefined();
  });
});
