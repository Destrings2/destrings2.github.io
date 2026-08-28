import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { EXAMPLE_HOME_DOCUMENT } from '@/data/exampleHome';
import { SEED_CHORES } from '@/data/seedChores';
import {
  clearInviteFromUrl,
  inviteCodeFromUrl,
  isSupabaseConfigured,
  supabase,
} from '@/api/supabase';

export interface HouseholdSummary {
  id: string;
  name: string;
  memberId: string;
}

export type SessionStage =
  /** No backend in this build: the app runs on-device and never asks who you are. */
  | 'local'
  | 'loading'
  | 'signedOut'
  /** Signed in, but not in a household yet. */
  | 'noHousehold'
  | 'ready';

interface SessionStore {
  stage: SessionStage;
  session: Session | null;
  household: HouseholdSummary | null;
  /** An invite code picked up from the address bar, if there was one. */
  pendingInvite: string | null;
  busy: boolean;
  error: string | null;
  /** Set after a magic link is sent, so the screen can say so. */
  linkSentTo: string | null;

  start(): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  signOut(): Promise<void>;
  createHousehold(name: string, displayName: string): Promise<void>;
  joinHousehold(code: string, displayName: string): Promise<void>;
  dismissError(): void;
}

const PALETTE = ['#E8B93E', '#5FA394', '#B47CC7', '#D97C5A'];

function message(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error && 'message' in error) return String(error.message);
  return 'Something went wrong. Try again.';
}

export const useSession = create<SessionStore>((set, get) => ({
  stage: isSupabaseConfigured ? 'loading' : 'local',
  session: null,
  household: null,
  pendingInvite: null,
  busy: false,
  error: null,
  linkSentTo: null,

  async start() {
    if (!isSupabaseConfigured) {
      set({ stage: 'local' });
      return;
    }
    set({ pendingInvite: inviteCodeFromUrl() });

    const client = supabase();
    const { data } = await client.auth.getSession();
    await adopt(data.session);

    client.auth.onAuthStateChange((_event, next) => {
      void adopt(next);
    });

    async function adopt(session: Session | null) {
      if (!session) {
        set({ session: null, household: null, stage: 'signedOut' });
        return;
      }
      set({ session });
      const { data: memberships, error } = await client
        .from('members')
        .select('id, household_id, households(id, name)')
        .limit(1);

      if (error) {
        set({ stage: 'noHousehold', error: message(error) });
        return;
      }
      const first = memberships?.[0] as
        | { id: string; household_id: string; households: { id: string; name: string } | null }
        | undefined;

      if (!first?.households) {
        set({ stage: 'noHousehold', household: null });
        return;
      }
      set({
        stage: 'ready',
        household: { id: first.households.id, name: first.households.name, memberId: first.id },
      });
    }
  },

  async sendMagicLink(email) {
    set({ busy: true, error: null });
    try {
      const redirect = get().pendingInvite
        ? `${window.location.origin}/join/${get().pendingInvite}`
        : window.location.origin;
      const { error } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: { emailRedirectTo: redirect },
      });
      if (error) throw error;
      set({ linkSentTo: email.trim() });
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async signOut() {
    await supabase().auth.signOut();
    set({ session: null, household: null, stage: 'signedOut', linkSentTo: null });
  },

  async createHousehold(name, displayName) {
    set({ busy: true, error: null });
    try {
      const client = supabase();
      const { data: householdId, error } = await client.rpc('create_household', {
        household_name: name.trim(),
        display_name: displayName.trim(),
        colour: PALETTE[0],
      });
      if (error) throw error;

      // A new household starts with a home and a chore list, so the first
      // screen is a real plan rather than an empty one.
      const { data: propertyId, error: seedError } = await client.rpc('seed_property', {
        target_household: householdId,
        document: EXAMPLE_HOME_DOCUMENT,
      });
      if (seedError) throw seedError;

      const { error: choreError } = await client.rpc('seed_chores', {
        target_household: householdId,
        target_property: propertyId,
        chore_list: SEED_CHORES.map((c) => ({
          key: c.key,
          room: c.room,
          name: c.name,
          mins: c.mins,
          cadence: c.cadence,
          noisy: c.noisy ?? false,
          grim: c.grim ?? false,
        })),
      });
      if (choreError) throw choreError;

      await get().start();
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async joinHousehold(code, displayName) {
    set({ busy: true, error: null });
    try {
      const { error } = await supabase().rpc('join_household', {
        invite_code: code.trim().toUpperCase(),
        display_name: displayName.trim(),
        colour: PALETTE[1],
      });
      if (error) throw error;
      clearInviteFromUrl();
      set({ pendingInvite: null });
      await get().start();
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  dismissError: () => set({ error: null }),
}));
