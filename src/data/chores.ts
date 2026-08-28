import type { Cadence, Chore } from '@/domain/types';

/**
 * A chore as written in a starter list.
 *
 * `key` is stable and survives re-seeding, so adding a job to a list later
 * never duplicates one a household already has. `room` is a room slug; null
 * means the whole home.
 */
export interface SeedChore {
  key: string;
  room: string | null;
  name: string;
  mins: number;
  cadence: Cadence;
  noisy?: boolean;
  grim?: boolean;
}

/**
 * Resolve a starter list against a room-slug to id map.
 *
 * Lives here rather than beside any particular list so that importing the
 * function does not drag a list into the bundle with it — which is exactly
 * what was happening with the the example home one.
 */
export function seedToChores(
  seed: readonly SeedChore[],
  roomId: (slug: string) => string | null = (s) => s,
): Chore[] {
  return seed.map((s) => ({
    id: s.key,
    roomId: s.room === null ? null : roomId(s.room),
    name: s.name,
    mins: s.mins,
    cadence: s.cadence,
    noisy: s.noisy ?? false,
    grim: s.grim ?? false,
    preferredBy: null,
    enabled: true,
  }));
}
