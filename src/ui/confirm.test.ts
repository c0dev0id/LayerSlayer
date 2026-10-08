import { describe, expect, it } from 'vitest';
import { answerConfirmation, askConfirmation, question } from './confirm';

describe('askConfirmation', () => {
  it('resolves with the answer and closes the question', async () => {
    const yes = askConfirmation('Delete the route "Tour"?', 'Delete');
    expect(question()).toMatchObject({ message: 'Delete the route "Tour"?', action: 'Delete' });
    answerConfirmation(true);
    await expect(yes).resolves.toBe(true);
    expect(question()).toBeUndefined();

    const no = askConfirmation('Export anyway?', 'Export');
    answerConfirmation(false);
    await expect(no).resolves.toBe(false);
  });

  it('declines a question still open when the next one comes', async () => {
    const first = askConfirmation('First?', 'Go');
    const second = askConfirmation('Second?', 'Go');
    await expect(first).resolves.toBe(false);
    expect(question()?.message).toBe('Second?');
    answerConfirmation(true);
    await expect(second).resolves.toBe(true);
  });

  it('ignores an answer when nothing is asked', () => {
    expect(() => answerConfirmation(true)).not.toThrow();
  });
});
