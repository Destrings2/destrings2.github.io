import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env['VITE_SUPABASE_URL'] as string | undefined;
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string | undefined;

/**
 * Whether this build has a backend at all.
 *
 * With no project configured the app runs entirely on-device, which is how it
 * behaved for the whole of phases 2 to 4 and is still the right answer for
 * someone who just wants a chore list on one phone. Signing in is what buys
 * you a second device, not what makes the app work.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

let cached: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this build');
  }
  cached ??= createClient(url!, anonKey!, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return cached;
}

/**
 * The invite code in a URL, from /join/CODE or ?join=CODE.
 *
 * Takes the URL rather than reading `window` so it can be tested without a
 * browser, and so a magic-link redirect can be parsed before navigation.
 */
export function inviteCodeIn(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const fromPath = url.pathname.match(/^\/join\/([A-Za-z0-9]{6,12})\/?$/);
  if (fromPath) return fromPath[1]!.toUpperCase();
  const fromQuery = url.searchParams.get('join');
  if (!fromQuery) return null;
  return /^[A-Za-z0-9]{6,12}$/.test(fromQuery) ? fromQuery.toUpperCase() : null;
}

export function inviteCodeFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  return inviteCodeIn(window.location.href);
}

/** Drop the invite out of the URL once it has been used. */
export function clearInviteFromUrl() {
  if (typeof window === 'undefined') return;
  window.history.replaceState(null, '', '/');
}
