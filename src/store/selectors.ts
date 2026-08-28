import type { Floorplan } from '@/data/floorplanTypes';
import type { Chore, ChoreId, Person, PersonId, RoomId } from '@/domain/types';
import type { HouseholdState } from './types';

export const WHOLE_HOME = '__home__';

export const choreById = (state: HouseholdState, id: ChoreId): Chore | undefined =>
  state.chores.find((c) => c.id === id);

export const personById = (state: HouseholdState, id: PersonId | null): Person | undefined =>
  id ? state.people.find((p) => p.id === id) : undefined;

/**
 * Room names come from whichever plan is loaded, not from a constant: the
 * household's real geometry arrives over the wire, so nothing here can assume
 * it knows the rooms in advance.
 */
export function roomNameIn(plan: Floorplan, roomId: RoomId): string {
  if (roomId === null) return 'Whole home';
  return plan.rooms.find((r) => r.slug === roomId)?.name ?? roomId;
}

/** The room list the Rooms tab offers, with the whole-home bucket last. */
export function roomOptions(plan: Floorplan): { id: RoomId; key: string; name: string }[] {
  return [
    ...plan.rooms.map((r) => ({ id: r.slug as RoomId, key: r.slug, name: r.name })),
    { id: null, key: WHOLE_HOME, name: 'Whole home' },
  ];
}

/** Load is keyed by room slug, with whole-home chores under WHOLE_HOME. */
export const loadKey = (roomId: RoomId): string => roomId ?? WHOLE_HOME;
