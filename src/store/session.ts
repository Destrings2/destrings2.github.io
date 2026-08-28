import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { ACCENTS } from '@/data/palette';
import { STARTER_CHORES } from '@/data/starterChores';
import { STARTER_FLAT } from '@/data/starterFlat';
import {
  appUrl,
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
  /** Every household this account belongs to, oldest first. */
  households: HouseholdSummary[];
  /** An invite code picked up from the address bar, if there was one. */
  pendingInvite: string | null;
  busy: boolean;
  error: string | null;
  /** Set after a magic link is sent, so the screen can say so. */
  linkSentTo: string | null;

  start(): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  /** Sign in with a password, for when email is rate-limited or unwanted. */
  signInWithPassword(email: string, password: string): Promise<void>;
  /** Create an account with a password. Only offered to someone holding an invite. */
  signUpWithPassword(email: string, password: string): Promise<void>;
  /** Set or change the password on the account already signed in. */
  setPassword(password: string): Promise<boolean>;
  signOut(): Promise<void>;
  /** Switch to another household this account is in. */
  switchHousehold(id: string): void;
  createHousehold(name: string, displayName: string, founderCode: string): Promise<void>;
  joinHousehold(code: string, displayName: string): Promise<void>;
  /** Mint or fetch this household's invite link, to hand to the other person. */
  inviteLink(): Promise<string | null>;
  dismissError(): void;
}

function message(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error && 'message' in error
        ? String(error.message)
        : '';
  // Supabase says "Signups not allowed"; here that is not a fault but the
  // point, and the way out is an invite rather than trying again.
  if (/signups? not allowed|signup is disabled/i.test(raw)) {
    return 'This address has no account here. You need an invite link from someone already in the household.';
  }
  return raw || 'Something went wrong. Try again.';
}

/** Which household this device last had open. */
const LAST_HOUSEHOLD = 'rota:household';

/**
 * Storage that is allowed to be missing. A browser told to block site data
 * throws on access rather than returning null, and that must not be the
 * reason someone cannot sign in — the preference is a convenience.
 */
function rememberedHousehold(): string | null {
  try {
    return localStorage.getItem(LAST_HOUSEHOLD);
  } catch {
    return null;
  }
}

export const useSession = create<SessionStore>((set, get) => ({
  stage: isSupabaseConfigured ? 'loading' : 'local',
  session: null,
  household: null,
  households: [],
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
      // Ordered, and not truncated to one. An unordered limit(1) let Postgres
      // hand back whichever row it liked, so an account in two households
      // could land in a different one from one sign-in to the next — and the
      // other household's home would look like it had gone missing.
      const { data: memberships, error } = await client
        .from('members')
        .select('id, household_id, created_at, households(id, name)')
        .order('created_at');

      if (error) {
        set({ stage: 'noHousehold', error: message(error) });
        return;
      }
      interface Named {
        id: string;
        name: string;
      }
      // An embedded to-one relation comes back as an object, but PostgREST
      // types it as an array; take either rather than trusting one shape.
      const rows = (memberships ?? []) as unknown as {
        id: string;
        household_id: string;
        households: Named | Named[] | null;
      }[];
      const households: HouseholdSummary[] = rows.flatMap((row) => {
        const household = Array.isArray(row.households) ? row.households[0] : row.households;
        return household ? [{ id: household.id, name: household.name, memberId: row.id }] : [];
      });

      if (households.length === 0) {
        set({ stage: 'noHousehold', household: null, households: [] });
        return;
      }

      // Whichever one was last opened on this device, so switching sticks.
      const lastOpened = rememberedHousehold();
      const remembered = households.find((h) => h.id === lastOpened);
      set({ stage: 'ready', households, household: remembered ?? households[0]! });
    }
  },

  async sendMagicLink(email) {
    set({ busy: true, error: null });
    try {
      const invite = get().pendingInvite;
      const redirect = invite ? appUrl(`join/${invite}`) : appUrl('');
      const { error } = await supabase().auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirect,
          // Only somebody holding an invite may bring a new account into
          // existence. Without one this signs in an address that already
          // has an account and otherwise refuses, rather than quietly
          // creating an account and mailing whoever was typed in.
          //
          // This governs what the app does, not what the project allows:
          // the publishable key is in the bundle, so the auth endpoints can
          // be called directly. Turning off sign-ups on the project is what
          // actually closes that, and this matches the app to it.
          shouldCreateUser: Boolean(invite),
        },
      });
      if (error) throw error;
      set({ linkSentTo: email.trim() });
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  async signInWithPassword(email, password) {
    set({ busy: true, error: null });
    try {
      const { error } = await supabase().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  /**
   * Creates an account without waiting for a link.
   *
   * Only reachable when the address bar carries an invite, so this is not a
   * public sign-up: without a household invite the account it creates can do
   * nothing at all. If the project still has email confirmation switched on,
   * Supabase sends a confirmation and there is no session until it is clicked
   * — which the screen says rather than appearing to hang.
   */
  async signUpWithPassword(email, password) {
    set({ busy: true, error: null });
    try {
      const client = supabase();
      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: appUrl('') },
      });
      if (error) throw error;
      if (!data.session) set({ linkSentTo: email.trim() });
    } catch (error) {
      set({ error: message(error) });
    } finally {
      set({ busy: false });
    }
  },

  /**
   * Gives the account a password without sending anything.
   *
   * Supabase's built-in mailer allows only a handful of messages an hour, so
   * an app that can only be entered by magic link locks you out of your own
   * testing. Setting a password from a session you already have needs no email
   * at all, and the invite is what actually gates access here — not proof that
   * you own the address.
   */
  async setPassword(password) {
    set({ busy: true, error: null });
    try {
      const { error } = await supabase().auth.updateUser({
        password,
        data: { has_password: true },
      });
      if (error) throw error;
      return true;
    } catch (error) {
      set({ error: message(error) });
      return false;
    } finally {
      set({ busy: false });
    }
  },

  async signOut() {
    await supabase().auth.signOut();
    set({ session: null, household: null, stage: 'signedOut', linkSentTo: null });
  },

  switchHousehold(id) {
    const next = get().households.find((h) => h.id === id);
    if (!next) return;
    try {
      localStorage.setItem(LAST_HOUSEHOLD, id);
    } catch {
      // Private browsing: the switch still works for this session.
    }
    set({ household: next });
  },

  async createHousehold(name, displayName, founderCode) {
    set({ busy: true, error: null });
    try {
      const client = supabase();
      const { data: householdId, error } = await client.rpc('create_household', {
        household_name: name.trim(),
        display_name: displayName.trim(),
        invite_code: founderCode.trim().toUpperCase(),
        colour: ACCENTS[0]!.hex,
      });
      if (error) throw error;

      // A new household starts with the generic flat and a chore list, so the
      // first screen is a real plan rather than an empty one. They edit it into
      // their own place; nobody else's home is shipped to them.
      const { data: propertyId, error: seedError } = await client.rpc('seed_property', {
        target_household: householdId,
        document: STARTER_FLAT,
      });
      if (seedError) throw seedError;

      const { error: choreError } = await client.rpc('seed_chores', {
        target_household: householdId,
        target_property: propertyId,
        chore_list: STARTER_CHORES.map((c) => ({
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
        // The database picks the first of these nobody in the household has.
        palette: ACCENTS.map((a) => a.hex),
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

  async inviteLink() {
    const household = get().household;
    if (!household) return null;
    const client = supabase();

    // Reuse an unclaimed one rather than minting a fresh code every time the
    // card is opened, so a link already sent by text still works.
    const { data: existing } = await client.rpc('household_invite_link', {
      target_household: household.id,
    });
    const found = (existing as { code: string }[] | null)?.[0]?.code;
    if (found) return appUrl(`join/${found}`);

    const { data, error } = await client.rpc('create_invite', {
      target_household: household.id,
    });
    if (error) {
      set({ error: message(error) });
      return null;
    }
    return appUrl(`join/${data as string}`);
  },

  dismissError: () => set({ error: null }),
}));
