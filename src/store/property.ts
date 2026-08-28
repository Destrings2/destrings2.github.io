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
  /** 'starter' until real geometry arrives, so the scene can say so. */
  source: 'starter' | 'household';
  loading: boolean;
  useStarter(): void;
  load(client: SupabaseClient, householdId: string): Promise<void>;
}

export const useProperty = create<PropertyStore>((set) => ({
  plan: STARTER_PLAN,
  source: 'starter',
  loading: false,

  useStarter() {
    set({ plan: STARTER_PLAN, source: 'starter', loading: false });
  },

  async load(client, householdId) {
    set({ loading: true });
    try {
      const plan = await loadFloorplan(client, householdId);
      // A household with no property yet keeps the starter rather than an
      // empty screen — it is a real flat, just not theirs.
      set(plan ? { plan, source: 'household' } : { plan: STARTER_PLAN, source: 'starter' });
    } catch {
      set({ plan: STARTER_PLAN, source: 'starter' });
    } finally {
      set({ loading: false });
    }
  },
}));
