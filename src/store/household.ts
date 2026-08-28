import { create } from 'zustand';
import {
  DEFAULT_SPLIT_WEEKEND,
  DEFAULT_WEEKDAY_EVENINGS,
  emptyGrid,
  gridFrom,
  type GridSpec,
} from '@/data/defaultAvailability';
import { seedToChores } from '@/data/seedChores';
import { buildPlan } from '@/domain/scheduler';
import { HN, weekIndex, weekKey } from '@/domain/time';
import { DEFAULT_CONFIG } from '@/domain/types';
import type { Cadence, Chore, OccurrenceKey, PersonId, RoomId, WeekPlan } from '@/domain/types';
import { indexedDbRepository, type Repository } from './repository';
import type { HouseholdState, StoredWeek, TintMode } from './types';

const PALETTE = ['#E8B93E', '#5FA394', '#B47CC7', '#D97C5A'];

export function blankState(): HouseholdState {
  return {
    version: 1,
    people: [
      { id: 'a', name: 'Me', colour: PALETTE[0]! },
      { id: 'b', name: 'Partner', colour: PALETTE[1]! },
    ],
    chores: seedToChores(),
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
  hydrate(repo?: Repository): Promise<void>;

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
  assign(weekKey: string, occurrence: OccurrenceKey, personId: PersonId): void;
  skip(weekKey: string, occurrence: OccurrenceKey): void;
  unskip(weekKey: string, occurrence: OccurrenceKey): void;
  automate(weekKey: string, occurrence: OccurrenceKey): void;

  renamePeople(names: string[]): void;
  setAvailability(personId: PersonId, grid: boolean[][]): void;
  applyPreset(personId: PersonId, spec: GridSpec | null): void;
  setDailyCap(mins: number): void;
  setTint(tint: TintMode): void;

  addChore(input: { roomId: RoomId; name: string; mins: number; cadence: Cadence }): void;
  toggleChore(id: string): void;
  removeChore(id: string): void;

  resetLedger(): void;
  resetAll(): void;
}

let repository: Repository = indexedDbRepository;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export const useHousehold = create<HouseholdStore>((set, get) => {
  /** Debounced write. Painting a grid fires this on every cell. */
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void repository.save(get().state);
    }, 400);
  }

  function commit(mutate: (draft: HouseholdState) => void) {
    const draft = structuredClone(get().state);
    mutate(draft);
    set({ state: draft });
    persist();
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

    async hydrate(repo) {
      if (repo) repository = repo;
      const loaded = await repository.load();
      const state = loaded ? reconcile(loaded) : blankState();
      set({ state, status: 'ready' });
      // Make sure this week exists before anything renders against it.
      get().currentWeek();
    },

    weekFor(key) {
      const existing = get().state.weeks[key];
      if (existing) return existing;
      const draft = structuredClone(get().state);
      const week = freeze(draft, key);
      set({ state: draft });
      persist();
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
      commit((draft) => {
        const previous = draft.weeks[key];
        if (previous) previous.overrides = {};
        rebuild(draft, key);
      });
    },

    toggleDone(weekKeyValue, occurrence) {
      commit((draft) => {
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
      });
    },

    place(weekKeyValue, occurrence, at) {
      commit((draft) => {
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

    assign(weekKeyValue, occurrence, personId) {
      commit((draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        const existing = week.overrides[occurrence];
        week.overrides[occurrence] = {
          personId,
          day: existing?.day ?? null,
          at: existing?.at ?? null,
          skip: false,
        };
        rebuild(draft, weekKeyValue);
      });
    },

    skip(weekKeyValue, occurrence) {
      commit((draft) => {
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
      commit((draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        delete week.overrides[occurrence];
        rebuild(draft, weekKeyValue);
      });
    },

    automate(weekKeyValue, occurrence) {
      commit((draft) => {
        const week = draft.weeks[weekKeyValue];
        if (!week) return;
        delete week.overrides[occurrence];
        rebuild(draft, weekKeyValue);
      });
    },

    renamePeople(names) {
      commit((draft) => {
        names.forEach((name, i) => {
          const person = draft.people[i];
          if (person && name.trim()) person.name = name.trim();
        });
        draft.named = true;
      });
    },

    setAvailability(personId, grid) {
      commit((draft) => {
        draft.availability[personId] = grid;
        rebuildFuture(draft);
      });
    },

    applyPreset(personId, spec) {
      commit((draft) => {
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
      commit((draft) => {
        draft.settings.dailyCap = mins;
        rebuildFuture(draft);
      });
    },

    setTint(tint) {
      commit((draft) => {
        draft.settings.tint = tint;
      });
    },

    addChore(input) {
      commit((draft) => {
        const chore: Chore = {
          id: `u${Date.now().toString(36)}`,
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
    },

    toggleChore(id) {
      commit((draft) => {
        const chore = draft.chores.find((c) => c.id === id);
        if (chore) chore.enabled = !chore.enabled;
        rebuildFuture(draft);
      });
    },

    removeChore(id) {
      commit((draft) => {
        draft.chores = draft.chores.filter((c) => c.id !== id);
        rebuildFuture(draft);
      });
    },

    resetLedger() {
      commit((draft) => {
        for (const person of draft.people) draft.ledger[person.id] = 0;
        draft.lastDoneBy = {};
      });
    },

    resetAll() {
      set({ state: blankState() });
      void repository.clear();
      get().currentWeek();
    },
  };
});
