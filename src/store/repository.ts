import { del, get, set } from 'idb-keyval';
import type { ChoreId, OccurrenceKey, PersonId } from '@/domain/types';
import type { HouseholdState } from './types';

/**
 * What changed, so a backend can write only that.
 *
 * Local persistence is naturally a snapshot and a remote one is naturally
 * granular, so `commit` carries both: the whole new state, and a note of which
 * part of it moved. IndexedDB ignores the note and writes the snapshot;
 * Supabase ignores the snapshot except to read the slice it needs.
 */
export type Change =
  | { kind: 'all' }
  | { kind: 'settings' }
  | { kind: 'members' }
  /**
   * One chore, named. Deliberately not "the chore set changed": reconciling a
   * whole collection means a device holding a slightly stale list deletes
   * whatever the other one just added.
   */
  | { kind: 'chore'; id: ChoreId; op: 'add' | 'update' | 'remove' }
  | { kind: 'availability'; personId: PersonId }
  | { kind: 'week'; weekKey: string }
  | { kind: 'override'; weekKey: string; occurrence: OccurrenceKey }
  | { kind: 'completion'; weekKey: string; occurrence: OccurrenceKey; added: boolean };

export interface Repository {
  readonly kind: 'local' | 'supabase';
  load(): Promise<HouseholdState | null>;
  commit(state: HouseholdState, change: Change): Promise<void>;
  /** Notifies when someone else changed something. Local storage never does. */
  subscribe(onRemoteChange: () => void): () => void;
  clear(): Promise<void>;
}

const KEY = 'rota/household/v1';

/**
 * On-device storage. Correct for one phone and wrong for two, which is exactly
 * what the seam is for.
 */
export const indexedDbRepository: Repository = {
  kind: 'local',

  async load() {
    try {
      return ((await get(KEY)) as HouseholdState | undefined) ?? null;
    } catch {
      // Private browsing, a blocked origin, a corrupt store: start fresh
      // rather than refusing to open.
      return null;
    }
  },

  async commit(state) {
    try {
      await set(KEY, state);
    } catch {
      // Nothing to be done about it here; the app keeps working in memory.
    }
  },

  subscribe() {
    return () => {};
  },

  async clear() {
    await del(KEY);
  },
};

/** Used by tests, and as the fallback when IndexedDB throws on open. */
export function memoryRepository(): Repository {
  let held: HouseholdState | null = null;
  return {
    kind: 'local',
    load: async () => held,
    commit: async (state) => void (held = state),
    subscribe: () => () => {},
    clear: async () => void (held = null),
  };
}
