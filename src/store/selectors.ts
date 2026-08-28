import { EXAMPLE_HOME } from '@/data/floorplan';
import type { Chore, ChoreId, Person, PersonId, RoomId } from '@/domain/types';
import type { HouseholdState } from './types';

export const WHOLE_HOME = '__home__';

export const choreById = (state: HouseholdState, id: ChoreId): Chore | undefined =>
  state.chores.find((c) => c.id === id);

export const personById = (state: HouseholdState, id: PersonId | null): Person | undefined =>
  id ? state.people.find((p) => p.id === id) : undefined;

const ROOM_NAMES = new Map(EXAMPLE_HOME.rooms.map((r) => [r.slug, r.name]));

export function roomName(roomId: RoomId): string {
  if (roomId === null) return 'Whole flat';
  return ROOM_NAMES.get(roomId) ?? roomId;
}

/** The room list the Rooms tab offers, with the whole-home bucket last. */
export const ROOM_OPTIONS: { id: RoomId; key: string; name: string }[] = [
  ...EXAMPLE_HOME.rooms.map((r) => ({ id: r.slug as RoomId, key: r.slug, name: r.name })),
  { id: null, key: WHOLE_HOME, name: 'Whole flat' },
];

/** Load is keyed by room slug, with whole-home chores under WHOLE_HOME. */
export const loadKey = (roomId: RoomId): string => roomId ?? WHOLE_HOME;
