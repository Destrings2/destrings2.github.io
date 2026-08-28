import { create } from 'zustand';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadFloorplan } from '@/api/geometry';
import { STARTER_FLAT } from '@/data/starterFlat';
import type { Floorplan } from '@/data/floorplanTypes';
import { resolveProperty } from '@/domain/geometry/resolve';

/** The generic flat that ships in the bundle. Describes nobody. */
export const STARTER_PLAN: Floorplan = resolveProperty(STARTER_FLAT);

interface PropertyStore {
  plan: Floorplan;
  /**
   * Where the plan on screen came from. 'starter' means the app is showing a
   * stand-in — either because this household has no home stored yet, or
   * because reading it failed. Those look identical on screen, so `error`
   * separates them.
   */
  source: 'starter' | 'household';
  /** Why the real home isn't showing, when that is a fault rather than a fact. */
  error: string | null;
  loading: boolean;
  useStarter(): void;
  load(client: SupabaseClient, householdId: string): Promise<void>;
}

export const useProperty = create<PropertyStore>((set) => ({
  plan: STARTER_PLAN,
  source: 'starter',
  error: null,
  loading: false,

  useStarter() {
    set({ plan: STARTER_PLAN, source: 'starter', error: null, loading: false });
  },

  async load(client, householdId) {
    set({ loading: true, error: null });
    try {
      const plan = await loadFloorplan(client, householdId);
      // A household with no home stored yet keeps the starter rather than an
      // empty screen — it is a real flat, just nobody's.
      set(
        plan
          ? { plan, source: 'household', error: null }
          : { plan: STARTER_PLAN, source: 'starter', error: null },
      );
    } catch (error) {
      // Swallowing this made a failed read indistinguishable from having no
      // home at all: both showed the starter, silently.
      set({
        plan: STARTER_PLAN,
        source: 'starter',
        error: error instanceof Error ? error.message : 'Could not load this home.',
      });
    } finally {
      set({ loading: false });
    }
  },
}));
