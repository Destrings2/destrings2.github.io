import { Color } from 'three';
import type { Floorplan } from '@/data/floorplanTypes';
import { formatMins } from '@/domain/time';
import type { Person } from '@/domain/types';
import type { RoomLoad } from '@/domain/totals';
import type { TintMode } from '@/store/types';
import type { RoomLabel } from './labels';

const CLEAR = 0xc9cfc9;
const NEUTRAL_WHO = 0xd7d3ca;
const NEUTRAL_LOAD = 0xcfd3d0;
const SIGNAL = 0xe8b93e;
const OPEN = 0xe8b93e;

/** Whoever holds the most outstanding minutes in this room. */
function busiest(load: RoomLoad, people: Person[]): Person | null {
  let best: Person | null = null;
  let most = 0;
  for (const person of people) {
    const mins = load.byPerson[person.id] ?? 0;
    if (mins > most) {
      most = mins;
      best = person;
    }
  }
  return best;
}

const mix = (from: number, to: number | string, amount: number) =>
  new Color(from).lerp(new Color(to as number), amount).getHex();

export function roomTints(
  plan: Floorplan,
  load: Record<string, RoomLoad>,
  people: Person[],
  mode: TintMode,
  openRoom: string | null,
): Map<string, number> {
  const tints = new Map<string, number>();
  const highest = Math.max(1, ...plan.rooms.map((r) => load[r.slug]?.left ?? 0));

  for (const room of plan.rooms) {
    if (room.slug === openRoom) {
      tints.set(room.slug, OPEN);
      continue;
    }
    if (mode === 'plain') {
      tints.set(room.slug, room.floorColour);
      continue;
    }
    const here = load[room.slug];
    const left = here?.left ?? 0;

    if (mode === 'who') {
      if (!left || !here) {
        tints.set(room.slug, CLEAR);
        continue;
      }
      const owner = busiest(here, people);
      tints.set(room.slug, owner ? mix(NEUTRAL_WHO, owner.colour, 0.75) : CLEAR);
      continue;
    }

    tints.set(room.slug, mix(NEUTRAL_LOAD, SIGNAL, 0.15 + 0.8 * (left / highest)));
  }
  return tints;
}

export function roomLabels(
  plan: Floorplan,
  load: Record<string, RoomLoad>,
  people: Person[],
): Map<string, RoomLabel> {
  const labels = new Map<string, RoomLabel>();
  for (const room of plan.rooms) {
    const here = load[room.slug];
    const left = here?.left ?? 0;
    const total = here?.total ?? 0;
    const owner = here ? busiest(here, people) : null;

    labels.set(room.slug, {
      slug: room.slug,
      name: room.name,
      sub: left ? `${formatMins(left)} left this week` : total ? 'clear ✓' : room.dimsLabel,
      accent: left && owner ? owner.colour : '#5FA394',
    });
  }
  return labels;
}
