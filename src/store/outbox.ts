import type { Change } from './repository';

export interface OutboxDeps {
  /** Send one change. Rejecting means it will be retried. */
  send(change: Change): Promise<void>;
  /** Called whenever the queue goes from having work to having none. */
  onIdle?(): void;
  /** Called when a change is given up on. */
  onGaveUp?(change: Change, error: unknown): void;
}

export interface OutboxOptions {
  /** How long to wait for more edits to the same thing before sending. */
  debounceMs?: number;
  maxAttempts?: number;
  backoffMs?(attempt: number): number;
}

interface Entry {
  change: Change;
  attempts: number;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  /** Replaced by a newer edit while the current one was in the air. */
  superseded: boolean;
}

/**
 * Pending writes, keyed so that repeated edits to the same thing collapse.
 *
 * Two jobs. It coalesces — a drag across the availability grid is one write,
 * not forty. And it is the thing that knows whether it is safe to accept a
 * refresh from the server: a change that has been made locally but not yet
 * sent would be silently undone by a refetch, so the store waits for the queue
 * to drain before applying one.
 *
 * Failures retry with a backoff rather than being dropped, which is what makes
 * the app usable on a phone that keeps losing signal in the back bedroom.
 */
export function createOutbox(deps: OutboxDeps, options: OutboxOptions = {}) {
  const debounceMs = options.debounceMs ?? 350;
  const maxAttempts = options.maxAttempts ?? 6;
  const backoffMs = options.backoffMs ?? ((attempt) => Math.min(30_000, 500 * 2 ** (attempt - 1)));

  const entries = new Map<string, Entry>();

  function announceIfIdle() {
    if (entries.size === 0) deps.onIdle?.();
  }

  function schedule(key: string, delay: number) {
    const entry = entries.get(key);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = setTimeout(() => void run(key), delay);
  }

  async function run(key: string) {
    const entry = entries.get(key);
    if (!entry || entry.inFlight) return;
    entry.timer = null;
    entry.inFlight = true;
    entry.attempts += 1;

    try {
      await deps.send(entry.change);
      entry.inFlight = false;
      // A newer edit arrived while this one was in the air, so the queue is
      // not empty after all — send the replacement rather than dropping it.
      if (entry.superseded) {
        entry.superseded = false;
        entry.attempts = 0;
        schedule(key, 0);
        return;
      }
      entries.delete(key);
      announceIfIdle();
    } catch (error) {
      entry.inFlight = false;
      if (entry.attempts >= maxAttempts) {
        entries.delete(key);
        deps.onGaveUp?.(entry.change, error);
        announceIfIdle();
        return;
      }
      schedule(key, backoffMs(entry.attempts));
    }
  }

  return {
    /** Queue a change, replacing any earlier one under the same key. */
    enqueue(key: string, change: Change) {
      const existing = entries.get(key);
      if (existing) {
        existing.change = change;
        // Something already going out stays going; the replacement is sent
        // after it lands, so writes to one key never overtake each other.
        if (existing.inFlight) {
          existing.superseded = true;
        } else {
          existing.attempts = 0;
          schedule(key, debounceMs);
        }
        return;
      }
      entries.set(key, { change, attempts: 0, timer: null, inFlight: false, superseded: false });
      schedule(key, debounceMs);
    },

    /** True when everything has been acknowledged. */
    isIdle: () => entries.size === 0,
    size: () => entries.size,

    /** Send everything now — on reconnect, or when the tab is hidden. */
    flush() {
      for (const [key, entry] of entries) {
        if (entry.inFlight) continue;
        entry.attempts = 0;
        schedule(key, 0);
      }
    },

    /** Drop everything, unsent. Used when signing out. */
    clear() {
      for (const entry of entries.values()) if (entry.timer) clearTimeout(entry.timer);
      entries.clear();
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
