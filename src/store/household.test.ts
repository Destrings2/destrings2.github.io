import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blankState, useHousehold } from './household';
import type { Change, Repository } from './repository';
import type { HouseholdState } from './types';

/**
 * A backend that can be held still mid-read.
 *
 * What these cover is entirely a matter of ordering: what a read returns is
 * decided when it is issued, and it is applied when it lands. Those are not
 * the same moment, and an edit made in between is the thing at risk. So the
 * fake can start a read, hold it open while something else happens, and let
 * it land afterwards.
 */
function fakeBackend() {
  let server: HouseholdState = blankState();
  const commits: Change[] = [];
  let notify: (() => void) | null = null;
  let holding = false;
  const held: (() => void)[] = [];

  const repo: Repository = {
    kind: 'supabase',
    async load() {
      // Decided now. Nothing that happens while this is in the air can
      // change what it is going to say.
      const reply = structuredClone(server);
      if (holding) await new Promise<void>((resolve) => held.push(resolve));
      return reply;
    },
    async commit(state, change) {
      commits.push(change);
      // Only what the change names, the way the real one writes a row at a
      // time. A fake that replaced the whole server on every write would
      // manufacture conflicts the app cannot actually have — and would have
      // had this suite reporting a bug that is not there.
      const draft = structuredClone(server);
      switch (change.kind) {
        case 'settings':
          draft.settings = structuredClone(state.settings);
          break;
        case 'members':
          draft.people = structuredClone(state.people);
          break;
        case 'availability':
          draft.availability[change.personId] = structuredClone(
            state.availability[change.personId]!,
          );
          break;
        default:
          // 'all', and the week-shaped changes, do carry everything.
          Object.assign(draft, structuredClone(state));
      }
      server = draft;
      // Postgres tells everyone subscribed, the writer included.
      notify?.();
    },
    subscribe(onRemoteChange) {
      notify = onRemoteChange;
      return () => {
        notify = null;
      };
    },
    async clear() {
      server = blankState();
    },
  };

  return {
    repo,
    commits,
    hold: () => void (holding = true),
    release: () => {
      holding = false;
      for (const resolve of held.splice(0)) resolve();
    },
    /** Someone else's device changed something. */
    remoteEdit(mutate: (draft: HouseholdState) => void) {
      const draft = structuredClone(server);
      mutate(draft);
      server = draft;
      notify?.();
    },
  };
}

/** Let queued promise callbacks run between fake-timer steps. */
const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

const colourOf = (id: string) =>
  useHousehold.getState().state.people.find((p) => p.id === id)?.colour;

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  useHousehold.getState().detach();
  vi.useRealTimers();
});

async function ready(backend: ReturnType<typeof fakeBackend>) {
  await useHousehold.getState().hydrate(backend.repo);
  // Opening the week is itself a write; let it drain so the queue starts empty.
  await vi.advanceTimersByTimeAsync(1000);
  await settle();
}

describe('a read that lands after the edit it predates', () => {
  it('does not put back a colour that has since been changed', async () => {
    const backend = fakeBackend();
    await ready(backend);

    const first = '#AABBCC';
    const second = '#DDEEFF';

    // Every read from here on is held open until released.
    backend.hold();

    // Pick a colour. It is written, and Postgres echoes it back, which starts
    // the refetch that is now held mid-flight carrying this colour.
    useHousehold.getState().setPersonColour('a', first);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(colourOf('a')).toBe(first);

    // Pick another one while that read is still in the air.
    useHousehold.getState().setPersonColour('a', second);
    expect(colourOf('a')).toBe(second);

    // Now let it land. It is a truthful account of a moment that has passed.
    backend.release();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    expect(colourOf('a')).toBe(second);
  });

  it('leaves the second colour standing on the server too', async () => {
    const backend = fakeBackend();
    await ready(backend);

    backend.hold();
    useHousehold.getState().setPersonColour('a', '#AABBCC');
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    useHousehold.getState().setPersonColour('a', '#DDEEFF');
    backend.release();
    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    // The point of not applying the stale read is that the newer edit still
    // goes out; dropping it locally would have stranded the two out of step.
    expect(colourOf('a')).toBe('#DDEEFF');
    await useHousehold.getState().hydrate(backend.repo);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(colourOf('a')).toBe('#DDEEFF');
  });
});

describe('a change from the other device', () => {
  it('shows through when nothing of ours is waiting to be sent', async () => {
    const backend = fakeBackend();
    await ready(backend);

    backend.remoteEdit((draft) => {
      draft.people[0]!.colour = '#123456';
      draft.settings.dailyCap = 45;
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    expect(colourOf('a')).toBe('#123456');
    expect(useHousehold.getState().state.settings.dailyCap).toBe(45);
  });

  it('is not lost when it arrives while we are mid-write', async () => {
    const backend = fakeBackend();
    await ready(backend);

    // Ours is queued and theirs arrives before it has gone out. The refresh
    // has to wait, but it must not be forgotten.
    useHousehold.getState().setDailyCap(120);
    backend.remoteEdit((draft) => {
      draft.people[1]!.colour = '#654321';
    });

    await vi.advanceTimersByTimeAsync(2000);
    await settle();

    expect(useHousehold.getState().state.settings.dailyCap).toBe(120);
    expect(colourOf('b')).toBe('#654321');
  });
});
