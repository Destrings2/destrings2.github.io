import { create } from 'zustand';
import {
  DEFAULT_SPLIT_WEEKEND,
  DEFAULT_WEEKDAY_EVENINGS,
  emptyGrid,
  gridFrom,
  type GridSpec,
} from '@/data/defaultAvailability';
import { ACCENTS, nextFreeAccent } from '@/data/palette';
import { seedToChores } from '@/data/chores';
import { STARTER_CHORES } from '@/data/starterChores';
import { buildPlan } from '@/domain/scheduler';
import { HN, weekIndex, weekKey } from '@/domain/time';
import { DEFAULT_CONFIG } from '@/domain/types';
import type { Cadence, Chore, OccurrenceKey, PersonId, RoomId, WeekPlan } from '@/domain/types';
import { createOutbox, type Outbox } from './outbox';
import { indexedDbRepository, type Change, type Repository } from './repository';
import type { HouseholdState, StoredWeek, TintMode } from './types';

export function blankState(): HouseholdState {
  return {
    version: 1,
    people: [
      { id: 'a', name: 'Me', colour: ACCENTS[0]!.hex },
      { id: 'b', name: 'Partner', colour: ACCENTS[1]!.hex },
    ],
    chores: seedToChores(STARTER_CHORES),
    availability: {
      a: gridFrom(DEFAULT_WEEKDAY_EVENINGS),
      b: gridFrom(DEFAULT_SPLIT_WEEKEND),
    },
    weeks: {},
    ledger: { a: 0, b: 0 },
    lastDoneBy: {},
    settings: { dailyCap: DEFAULT_CONFIG.dailyCap, tint: 'load' },
    named: false,
  };
}

/** Repair a snapshot written by an older build, or a half-written one. */
function reconcile(state: HouseholdState): HouseholdState {
  const next: HouseholdState = { ...blankState(), ...state };
  next.settings = { ...blankState().settings, ...state.settings };

  for (const person of next.people) {
    const grid = next.availability[person.id];
    const shaped =
      Array.isArray(grid) &&
      grid.length === 7 &&
      grid.every((d) => Array.isArray(d) && d.length === HN);
    if (!shaped) next.availability[person.id] = emptyGrid();
    next.ledger[person.id] ??= 0;
  }

  // Weeks older than twelve weeks are history nobody looks at.
  const keepFrom = Date.now() - 84 * 864e5;
  for (const key of Object.keys(next.weeks)) {
    if (new Date(`${key}T12:00:00`).getTime() < keepFrom) delete next.weeks[key];
  }
  return next;
}

interface HouseholdStore {
  state: HouseholdState;
  status: 'loading' | 'ready' | 'unsaved';
  /** Set when a write was retried to exhaustion and given up on. */
  writeFailed: string | null;
  /**
   * A given-up write was dropped from the queue, so retrying means re-sending
   * the whole current state, not nudging a queue that no longer holds it.
   */
  retrySync(): void;
  hydrate(repo?: Repository): Promise<void>;
  /** Stop listening and drop any pending writes. Called on sign-out. */
  detach(): void;
  /** Send everything now — on reconnect, or when the tab is being hidden. */
  flushWrites(): void;
  hasUnsentWrites(): boolean;

  weekFor(key: string): StoredWeek;
  currentWeek(): { key: string; week: StoredWeek };
  reshuffle(key: string): void;
  /** A forecast for a week that has never been frozen. Never written down. */
  preview(key: string): WeekPlan;

  toggleDone(weekKey: string, occurrence: OccurrenceKey): void;
  place(
    weekKey: string,
    occurrence: OccurrenceKey,
    at: { personId: PersonId; day: number; at: number },
  ): void;
  skip(weekKey: string, occurrence: OccurrenceKey): void;
  unskip(weekKey: string, occurrence: OccurrenceKey): void;
  automate(weekKey: string, occurrence: OccurrenceKey): void;

  renamePeople(names: string[]): void;
  /** Change one person's accent colour. */
  setPersonColour(personId: PersonId, colour: string): void;
  /** The colour a person would get if they wanted one nobody else has. */
  freeColour(exceptPersonId?: PersonId): string;
  setAvailability(personId: PersonId, grid: boolean[][]): void;
  applyPreset(personId: PersonId, spec: GridSpec | null): void;
  setDailyCap(mins: number): void;
  setTint(tint: TintMode): void;

  /** Returns the new chore's id, so the caller can point at what it added. */
  addChore(input: { roomId: RoomId; name: string; mins: number; cadence: Cadence }): string;
  toggleChore(id: string): void;
  removeChore(id: string): void;

  resetLedger(): void;
  resetAll(): Promise<void>;
  /** Whether this install is on-device only, and so safe to wipe. */
  isLocalOnly(): boolean;
}

let repository: Repository = indexedDbRepository;
let unsubscribe: (() => void) | null = null;
let outbox: Outbox | null = null;
/** A refresh arrived while writes were still queued; run it once they land. */
let refreshDeferred = false;

/** What a change is keyed on, so edits to the same thing collapse. */
function outboxKey(change: Change): string {
  switch (change.kind) {
    case 'availability':
      return `availability:${change.personId}`;
    case 'chore':
      return `chore:${change.id}`;
    case 'week':
      return `week:${change.weekKey}`;
    case 'override':
    case 'completion':
      return `${change.kind}:${change.weekKey}:${change.occurrence}`;
    default:
      return change.kind;
  }
}

export const useHousehold = create<HouseholdStore>((set, get) => {
  async function refresh() {
    const fresh = await repository.load();
    if (!fresh) return;

    // Guarding before the fetch is not enough: it is what happens *during*
    // it that undoes an edit. Pick a colour, the write lands, the echo of it
    // starts a refetch — and if the next colour is picked while that refetch
    // is in the air, the reply is a truthful account of a moment that has
    // since passed, and applying it puts the old colour back. Which is why a
    // colour had to be picked two or three times to stick.
    if (outbox && !outbox.isIdle()) {
      refreshDeferred = true;
      return;
    }

    const next = reconcile(fresh);
    // Postgres broadcasts a change to everyone subscribed, including whoever
    // made it, so every edit came back as an echo and replaced the whole
    // state with an identical copy. Nothing was wrong with the result, but
    // every object identity changed, so the week was re-derived and the scene
    // redrawn a second time a beat after each edit — which is what the
    // flicker was. Same state, same objects, no render.
    if (JSON.stringify(next) === JSON.stringify(get().state)) return;
    set({ state: next });
  }

  function ensureOutbox(): Outbox {
    outbox ??= createOutbox({
      send: (change) => repository.commit(get().state, change),
      onIdle: () => {
        // Safe now: nothing local is waiting to be sent, so server state
        // cannot overwrite an edit that has not reached it.
        if (!refreshDeferred) return;
        refreshDeferred = false;
        void refresh();
      },
      onGaveUp: (change) => {
        set({ writeFailed: outboxKey(change) });
      },
    });
    return outbox;
  }

  function persist(change: Change) {
    ensureOutbox().enqueue(outboxKey(change), change);
  }

  function commit(change: Change, mutate: (draft: HouseholdState) => void) {
    const draft = structuredClone(get().state);
    mutate(draft);
    set({ state: draft });
    persist(change);
  }

  function derive(state: HouseholdState, key: string, overrides = {}): WeekPlan {
    return buildPlan({
      people: state.people,
      chores: state.chores,
      availability: state.availability,
      ledger: state.ledger,
      lastDoneBy: state.lastDoneBy,
      overrides,
      weekIndex: weekIndex(new Date(`${key}T12:00:00`)),
      config: { ...DEFAULT_CONFIG, dailyCap: state.settings.dailyCap },
    });
  }

  /** Freeze a week the first time it is asked for, then leave it alone. */
  function freeze(draft: HouseholdState, key: string, overrides = {}): StoredWeek {
    const built = derive(draft, key, overrides);
    const week: StoredWeek = {
      plan: built.plan,
      meta: built.meta,
      done: [],
      overrides,
      generatedAt: Date.now(),
    };
    draft.weeks[key] = week;
    return week;
  }

  /** Rebuild in place, carrying ticks over — occurrence keys are stable. */
  function rebuild(draft: HouseholdState, key: string) {
    const previous = draft.weeks[key];
    const done = previous?.done ?? [];
    const overrides = previous?.overrides ?? {};
    const week = freeze(draft, key, overrides);
    week.done = done.filter((k) => week.plan.some((e) => e.key === k));
  }

  /** Any change to the inputs invalidates every frozen week from now on. */
  function rebuildFuture(draft: HouseholdState) {
    const today = weekKey(new Date());
    for (const key of Object.keys(draft.weeks)) {
      if (key >= today) rebuild(draft, key);
    }
    if (!draft.weeks[today]) freeze(draft, today);
  }

  return {
    state: blankState(),
    status: 'loading',
    writeFailed: null,

    async hydrate(repo) {
      if (repo && repo !== repository) {
        unsubscribe?.();
        unsubscribe = null;
        repository = repo;
      }
      set({ status: 'loading' });
      const loaded = await repository.load();
      const state = loaded ? reconcile(loaded) : blankState();
      set({ state, status: 'ready' });
      // Make sure this week exists before anything renders against it.
      get().currentWeek();

      // Someone else's edit lands: refetch rather than patch a cache by hand.
      // But never on top of an edit of our own that has not been sent yet —
      // that would quietly undo it.
      unsubscribe ??= repository.subscribe(() => {
        if (outbox && !outbox.isIdle()) {
          refreshDeferred = true;
          return;
        }
        void refresh();
      });
    },

    detach() {
      unsubscribe?.();
      unsubscribe = null;
      outbox?.clear();
      outbox = null;
      refreshDeferred = false;
    },

    flushWrites() {
      outbox?.flush();
    },

    retrySync() {
      set({ writeFailed: null });
      persist({ kind: 'all' });
    },

    hasUnsentWrites: () => (outbox ? !outbox.isIdle() : false),

    weekFor(key) {
      const existing = get().state.weeks[key];
      if (existing) return existing;
      const draft = structuredClone(get().state);
      const week = freeze(draft, key);
      set({ state: draft });
      persist({ kind: 'week', weekKey: key });
      return week;
    },

    currentWeek() {
      const key = weekKey(new Date());
      return { key, week: get().weekFor(key) };
    },

    preview(key) {
      return derive(get().state, key);
    },

    reshuffle(key) {
      commit({ kind: 'week', weekKey: key }, (draft) => {
        const previous = draft.weeks[key];
        if (previous) previous.overrides = {};
        rebuild(draft, key);
      });
    },

    toggleDone(weekKeyValue, occurrence) {
      const already = get().state.weeks[weekKeyValue]?.done.includes(occurrence) ?? false;
      commit(
        { kind: 'completion', weekKey: weekKeyValue, occurrence, added: !already },
        (draft) => {
          const week = draft.weeks[weekKeyValue];
          if (!week) return;
          const entry = week.plan.find((e) => e.key === occurrence);
          if (!entry) return;
          const index = week.done.indexOf(occurrence);
          if (index >= 0) {
            week.done.splice(index, 1);
            if (entry.personId)
              draft.ledger[entry.personId] = (draft.ledger[entry.personId] ?? 0) - entry.mins;
          } else {
            week.done.push(occurrence);
            if (entry.personId) {
              draft.ledger[entry.personId] = (draft.ledger[entry.personId] ?? 0) + entry.mins;
              draft.lastDoneBy[entry.choreId] = entry.personId;
            }
          }
        },
      );
    },

    place(weekKeyValue, occurrence, at) {
      commit({ kind: 'override', weekKey: weekKeyValue, occurrence }, (draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        week.overrides[occurrence] = {
          personId: at.personId,
          day: at.day,
          at: at.at,
          skip: false,
        };
        const entry = week.plan.find((e) => e.key === occurrence);
        if (entry) {
          entry.personId = at.personId;
          entry.day = at.day;
          entry.at = at.at;
          entry.pinned = true;
          entry.skipped = false;
        }
      });
    },

    skip(weekKeyValue, occurrence) {
      commit({ kind: 'override', weekKey: weekKeyValue, occurrence }, (draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        const entry = week.plan.find((e) => e.key === occurrence);
        const doneIndex = week.done.indexOf(occurrence);
        if (doneIndex >= 0 && entry?.personId) {
          draft.ledger[entry.personId] = (draft.ledger[entry.personId] ?? 0) - entry.mins;
          week.done.splice(doneIndex, 1);
        }
        week.overrides[occurrence] = { personId: null, day: null, at: null, skip: true };
        if (entry) {
          entry.skipped = true;
          entry.personId = null;
          entry.at = null;
          entry.pinned = false;
        }
      });
    },

    unskip(weekKeyValue, occurrence) {
      commit({ kind: 'override', weekKey: weekKeyValue, occurrence }, (draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        delete week.overrides[occurrence];
        rebuild(draft, weekKeyValue);
      });
    },

    automate(weekKeyValue, occurrence) {
      commit({ kind: 'override', weekKey: weekKeyValue, occurrence }, (draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        delete week.overrides[occurrence];
        rebuild(draft, weekKeyValue);
      });
    },

    renamePeople(names) {
      commit({ kind: 'members' }, (draft) => {
        names.forEach((name, i) => {
          const person = draft.people[i];
          if (person && name.trim()) person.name = name.trim();
        });
        draft.named = true;
      });
    },

    setPersonColour(personId, colour) {
      commit({ kind: 'members' }, (draft) => {
        const person = draft.people.find((p) => p.id === personId);
        if (person) person.colour = colour;
      });
    },

    freeColour(exceptPersonId) {
      const taken = get()
        .state.people.filter((p) => p.id !== exceptPersonId)
        .map((p) => p.colour);
      return nextFreeAccent(taken);
    },

    setAvailability(personId, grid) {
      commit({ kind: 'availability', personId }, (draft) => {
        draft.availability[personId] = grid;
        rebuildFuture(draft);
      });
    },

    applyPreset(personId, spec) {
      commit({ kind: 'availability', personId }, (draft) => {
        if (spec === null) {
          draft.availability[personId] = emptyGrid();
        } else {
          const add = gridFrom(spec);
          const current = draft.availability[personId] ?? emptyGrid();
          draft.availability[personId] = current.map((day, d) =>
            day.map((on, h) => on || (add[d]?.[h] ?? false)),
          );
        }
        rebuildFuture(draft);
      });
    },

    setDailyCap(mins) {
      commit({ kind: 'settings' }, (draft) => {
        draft.settings.dailyCap = mins;
        rebuildFuture(draft);
      });
    },

    setTint(tint) {
      commit({ kind: 'settings' }, (draft) => {
        draft.settings.tint = tint;
      });
    },

    addChore(input) {
      // A real uuid rather than a local temporary: the row can then be written
      // by id, and the same chore has one identity on every device.
      const id = crypto.randomUUID();
      commit({ kind: 'chore', id, op: 'add' }, (draft) => {
        const chore: Chore = {
          id,
          roomId: input.roomId,
          name: input.name,
          mins: input.mins,
          cadence: input.cadence,
          noisy: false,
          grim: false,
          enabled: true,
        };
        draft.chores.push(chore);
        rebuildFuture(draft);
      });
      return id;
    },

    toggleChore(id) {
      commit({ kind: 'chore', id, op: 'update' }, (draft) => {
        const chore = draft.chores.find((c) => c.id === id);
        if (chore) chore.enabled = !chore.enabled;
        rebuildFuture(draft);
      });
    },

    removeChore(id) {
      commit({ kind: 'chore', id, op: 'remove' }, (draft) => {
        draft.chores = draft.chores.filter((c) => c.id !== id);
        rebuildFuture(draft);
      });
    },

    resetLedger() {
      commit({ kind: 'all' }, (draft) => {
        for (const person of draft.people) draft.ledger[person.id] = 0;
        draft.lastDoneBy = {};
      });
    },

    isLocalOnly: () => repository.kind === 'local',

    async resetAll() {
      // Only ever a local action. Wiping a shared household from one device,
      // behind the other person's back, is not something to offer at all —
      // so the button is not shown rather than failing after the fact.
      if (repository.kind !== 'local') return;
      await repository.clear();
      set({ state: blankState() });
      get().currentWeek();
    },
  };
});
