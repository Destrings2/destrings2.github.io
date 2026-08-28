import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createOutbox } from './outbox';
import type { Change } from './repository';

const settings: Change = { kind: 'settings' };
const chores: Change = { kind: 'chore', id: 'abc', op: 'update' };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** Let queued promise callbacks run between fake-timer steps. */
const settle = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

describe('createOutbox', () => {
  it('waits for the debounce before sending', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const outbox = createOutbox({ send }, { debounceMs: 300 });

    outbox.enqueue('settings', settings);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(299);
    expect(send).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('collapses repeated edits to the same thing into one write', async () => {
    // The case that matters: dragging across the availability grid.
    const send = vi.fn().mockResolvedValue(undefined);
    const outbox = createOutbox({ send }, { debounceMs: 300 });

    for (let i = 0; i < 40; i++) {
      outbox.enqueue('availability:a', { kind: 'availability', personId: 'a' });
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.advanceTimersByTimeAsync(400);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps different things separate', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const outbox = createOutbox({ send }, { debounceMs: 100 });

    outbox.enqueue('settings', settings);
    outbox.enqueue('chores', chores);
    await vi.advanceTimersByTimeAsync(200);

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('is not idle until the write has actually landed', async () => {
    let release: () => void = () => {};
    const send = vi.fn().mockImplementation(() => new Promise<void>((r) => (release = r)));
    const outbox = createOutbox({ send }, { debounceMs: 0 });

    outbox.enqueue('settings', settings);
    expect(outbox.isIdle()).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalled();
    expect(outbox.isIdle()).toBe(false);

    release();
    await settle();
    expect(outbox.isIdle()).toBe(true);
  });

  it('says when it has drained, so a deferred refresh can run', async () => {
    const onIdle = vi.fn();
    const outbox = createOutbox(
      { send: vi.fn().mockResolvedValue(undefined), onIdle },
      { debounceMs: 0 },
    );

    outbox.enqueue('settings', settings);
    await vi.advanceTimersByTimeAsync(1);
    await settle();

    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('retries a failed write with a growing backoff', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const outbox = createOutbox({ send }, { debounceMs: 0, backoffMs: (n) => n * 100 });

    outbox.enqueue('settings', settings);
    await vi.advanceTimersByTimeAsync(1);
    await settle();
    expect(send).toHaveBeenCalledTimes(1);
    expect(outbox.isIdle()).toBe(false);

    await vi.advanceTimersByTimeAsync(100);
    await settle();
    expect(send).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(200);
    await settle();
    expect(send).toHaveBeenCalledTimes(3);
    expect(outbox.isIdle()).toBe(true);
  });

  it('gives up eventually rather than retrying for ever', async () => {
    const onGaveUp = vi.fn();
    const send = vi.fn().mockRejectedValue(new Error('nope'));
    const outbox = createOutbox(
      { send, onGaveUp },
      { debounceMs: 0, maxAttempts: 3, backoffMs: () => 10 },
    );

    outbox.enqueue('settings', settings);
    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(20);
      await settle();
    }

    expect(send).toHaveBeenCalledTimes(3);
    expect(onGaveUp).toHaveBeenCalledTimes(1);
    expect(outbox.isIdle()).toBe(true);
  });

  it('does not let two writes to the same key overtake each other', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => {};
    const send = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            order.push('first sent');
            releaseFirst = () => {
              order.push('first done');
              r();
            };
          }),
      )
      .mockImplementation(async () => {
        order.push('second sent');
      });

    const outbox = createOutbox({ send }, { debounceMs: 0 });
    outbox.enqueue('settings', settings);
    await vi.advanceTimersByTimeAsync(1);

    // A second edit arrives while the first is still in the air.
    outbox.enqueue('settings', settings);
    await vi.advanceTimersByTimeAsync(50);
    expect(send).toHaveBeenCalledTimes(1);

    releaseFirst();
    await settle();
    await vi.advanceTimersByTimeAsync(10);
    await settle();

    expect(order).toEqual(['first sent', 'first done', 'second sent']);
  });

  it('sends everything immediately when told to flush', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const outbox = createOutbox({ send }, { debounceMs: 10_000 });

    outbox.enqueue('settings', settings);
    outbox.enqueue('chores', chores);
    expect(send).not.toHaveBeenCalled();

    outbox.flush();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('drops everything when cleared, and sends nothing after', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const outbox = createOutbox({ send }, { debounceMs: 50 });

    outbox.enqueue('settings', settings);
    outbox.clear();
    await vi.advanceTimersByTimeAsync(500);

    expect(send).not.toHaveBeenCalled();
    expect(outbox.isIdle()).toBe(true);
  });
});
