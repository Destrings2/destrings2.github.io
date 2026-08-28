import { del, get, set } from 'idb-keyval';
import type { HouseholdState } from './types';

/**
 * Where household state lives.
 *
 * A whole-snapshot interface is right for one device and wrong for two, so
 * Phase 6 replaces this with per-entity reads and writes against Supabase.
 * Keeping the seam here means the UI never learns which one it is talking to.
 */
export interface Repository {
  load(): Promise<HouseholdState | null>;
  save(state: HouseholdState): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'rota/household/v1';

export const indexedDbRepository: Repository = {
  async load() {
    try {
      return ((await get(KEY)) as HouseholdState | undefined) ?? null;
    } catch {
      // Private browsing, a blocked origin, a corrupt store: start fresh rather
      // than refusing to open.
      return null;
    }
  },
  async save(state) {
    await set(KEY, state);
  },
  async clear() {
    await del(KEY);
  },
};

/** Used by tests, and as the fallback when IndexedDB throws on open. */
export function memoryRepository(): Repository {
  let held: HouseholdState | null = null;
  return {
    load: async () => held,
    save: async (s) => void (held = s),
    clear: async () => void (held = null),
  };
}
