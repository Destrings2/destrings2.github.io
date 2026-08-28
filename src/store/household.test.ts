import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_SPLIT_WEEKEND,
  DEFAULT_WEEKDAY_EVENINGS,
  emptyGrid,
  gridFrom,
} from '@/data/defaultAvailability';
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
        case 'week':
        case 'override':
        case 'completion': {
          // One week's row. Emphatically not the people, which is what made
          // this fake swallow the other device's colour and report a bug the
          // real repository cannot produce.
          const week = state.weeks[change.weekKey];
          if (week) draft.weeks[change.weekKey] = structuredClone(week);
          break;
        }
        default:
          // 'all' really is everything.
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
    /** Put the server into a given state, as a fresh sign-in would find it. */
    setServer(next: HouseholdState) {
      server = structuredClone(next);
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

describe('a week that was planned before things changed', () => {
  it('re-plans when someone gains free time it was not built with', async () => {
    const backend = fakeBackend();
    await ready(backend);

    // Give one of them nothing, so the week is planned around the other.
    useHousehold.getState().applyPreset('b', null);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    const week = () => useHousehold.getState().currentWeek().week;
    expect(week().meta.free[1]).toBe(0);

    // Their hours arrive from their own phone: the grid changes underneath a
    // week that was planned without them. Nothing here re-plans it locally,
    // which is exactly the situation the other device was in.
    backend.remoteEdit((draft) => {
      draft.availability['b'] = draft.availability['a']!.map((day) => [...day]);
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    const free = week().meta.free;
    expect(free[1]).toBeGreaterThan(0);
    // And the work is actually split, rather than all of it sitting on one of
    // them with the rest under "didn't fit".
    const assigned = week().plan.filter((entry) => entry.personId === 'b');
    expect(assigned.length).toBeGreaterThan(0);
  });

  it('repairs a week frozen before anyone had painted any hours', async () => {
    // What a household actually starts as: the week is frozen the moment it
    // is opened, which on a fresh sign-in is before either grid exists. Both
    // people then read 0m of 0m, 0% of free, and every job sits under
    // "didn't fit" — because the plan was made for two people with no time.
    const backend = fakeBackend();
    backend.remoteEdit((draft) => {
      draft.availability['a'] = emptyGrid();
      draft.availability['b'] = emptyGrid();
    });
    await ready(backend);

    expect(useHousehold.getState().currentWeek().week.meta.free).toEqual([0, 0]);

    // Then the hours arrive.
    backend.remoteEdit((draft) => {
      draft.availability['a'] = gridFrom(DEFAULT_WEEKDAY_EVENINGS);
      draft.availability['b'] = gridFrom(DEFAULT_SPLIT_WEEKEND);
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    const week = useHousehold.getState().currentWeek().week;
    expect(week.meta.free[0]).toBeGreaterThan(0);
    expect(week.meta.free[1]).toBeGreaterThan(0);
    // Both meters read something, and the work is actually placed rather than
    // piled into "didn't fit".
    expect(week.meta.assigned[0]).toBeGreaterThan(0);
    expect(week.meta.assigned[1]).toBeGreaterThan(0);
    expect(week.plan.filter((e) => !e.skipped && e.personId === null)).toHaveLength(0);
  });

  it('leaves a week alone when nothing about it has changed', async () => {
    const backend = fakeBackend();
    await ready(backend);

    const before = useHousehold.getState().currentWeek().week;
    backend.remoteEdit((draft) => {
      draft.people[0]!.name = 'Renamed';
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    // A rename is not a reason to shuffle everybody's week.
    expect(useHousehold.getState().currentWeek().week.plan).toEqual(before.plan);
  });
});

describe('a week frozen while the jobs were missing', () => {
  it('fills in once the jobs come back', async () => {
    const backend = fakeBackend();

    // Exactly the state the missing column produced: a household with people
    // and hours, no jobs at all, and a week duly planned from that — which is
    // to say, an empty one, stored.
    const empty = blankState();
    empty.chores = [];
    backend.setServer(empty);
    await ready(backend);

    expect(useHousehold.getState().currentWeek().week.plan).toHaveLength(0);

    // The jobs are readable again. Nobody's free time has changed, so free
    // time alone would never notice.
    const withJobs = structuredClone(useHousehold.getState().state);
    withJobs.chores = blankState().chores;
    backend.setServer(withJobs);
    await useHousehold.getState().hydrate(backend.repo);
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    const week = useHousehold.getState().currentWeek().week;
    expect(week.plan.length).toBeGreaterThan(0);
    expect(week.plan.some((entry) => entry.personId != null)).toBe(true);
  });

  it('re-plans when a job is added on the other device', async () => {
    const backend = fakeBackend();
    await ready(backend);

    const before = useHousehold.getState().currentWeek().week.plan.length;

    backend.remoteEdit((draft) => {
      draft.chores = draft.chores.filter((chore) => chore.name !== 'Grocery shop');
    });
    await vi.advanceTimersByTimeAsync(1000);
    await settle();

    const after = useHousehold.getState().currentWeek().week.plan.length;
    expect(after).toBeLessThan(before);
    // And no entry may name a job that is no longer there.
    const ids = new Set(useHousehold.getState().state.chores.map((chore) => chore.id));
    for (const entry of useHousehold.getState().currentWeek().week.plan) {
      expect(ids.has(entry.choreId)).toBe(true);
    }
  });
});
