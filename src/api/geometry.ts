import type { SupabaseClient } from '@supabase/supabase-js';
import type { Floorplan } from '@/data/floorplanTypes';
import { resolveProperty } from '@/domain/geometry/resolve';
import type { LevelDocument, PropertyDocument, RoomRecord } from '@/domain/geometry/schema';

interface PropertyRow {
  id: string;
  name: string;
  subtitle: string | null;
  floor_area_sqm: number | null;
  exterior_m: number | null;
  interior_m: number | null;
}

interface LevelRow {
  id: string;
  name: string;
  ordinal: number;
  ceiling_m: number;
  geometry: Partial<Record<'nodes' | 'walls' | 'stairs' | 'furniture' | 'bay', unknown[]>> | null;
}

interface RoomRow {
  level_id: string;
  slug: string;
  name: string;
  dims_label: string | null;
  area_sqm: number | null;
  floor_colour: number;
  shapes: { rects?: unknown[]; polys?: unknown[] } | null;
  label_at: unknown;
  camera_view: unknown;
  sort: number;
}

const ROOM_COLUMNS =
  'level_id, slug, name, dims_label, area_sqm, floor_colour, shapes, label_at, camera_view, sort';

/**
 * The household's home, read from Postgres.
 *
 * The geometry of a real place — room sizes, wall positions, where the bed is
 * — has no business in a bundle anyone can download. It lives in a table
 * behind row-level security and arrives only once you are signed in to the
 * household it belongs to. What ships in the bundle is a generic starter flat
 * that describes nobody.
 *
 * Rooms come back as rows because chores point at them; everything else is the
 * level's own document, because nothing does.
 */
export async function loadFloorplan(
  client: SupabaseClient,
  householdId: string,
): Promise<Floorplan | null> {
  const { data: propertyRows, error } = await client
    .from('properties')
    .select('id, name, subtitle, floor_area_sqm, exterior_m, interior_m')
    .eq('household_id', householdId)
    .order('created_at')
    .limit(1);

  const property = (propertyRows as PropertyRow[] | null)?.[0];
  if (error || !property) return null;

  const { data: levelRows } = await client
    .from('levels')
    .select('id, name, ordinal, ceiling_m, geometry')
    .eq('property_id', property.id)
    .order('ordinal');

  const levels = (levelRows as LevelRow[] | null) ?? [];
  if (levels.length === 0) return null;

  const { data: roomRows } = await client
    .from('rooms')
    .select(ROOM_COLUMNS)
    .in(
      'level_id',
      levels.map((l) => l.id),
    )
    .order('sort');

  const rooms = (roomRows as RoomRow[] | null) ?? [];

  const document: PropertyDocument = {
    version: 1,
    units: 'm',
    name: property.name,
    subtitle: property.subtitle ?? '',
    floorAreaSqm: Number(property.floor_area_sqm ?? 0),
    defaults: {
      exterior: Number(property.exterior_m ?? 0.25),
      interior: Number(property.interior_m ?? 0.12),
    },
    levels: levels.map((level) => {
      const geometry = level.geometry ?? {};
      return {
        name: level.name,
        ordinal: level.ordinal,
        ceiling: Number(level.ceiling_m),
        nodes: geometry.nodes ?? [],
        walls: geometry.walls ?? [],
        stairs: geometry.stairs ?? [],
        furniture: geometry.furniture ?? [],
        bay: geometry.bay ?? [],
        rooms: rooms
          .filter((room) => room.level_id === level.id)
          .map((room) => ({
            slug: room.slug,
            name: room.name,
            dimsLabel: room.dims_label ?? '',
            areaSqm: Number(room.area_sqm ?? 0),
            floorColour: room.floor_colour,
            rects: room.shapes?.rects ?? [],
            polys: room.shapes?.polys ?? [],
            labelAt: room.label_at,
            cameraView: room.camera_view,
          })) as RoomRecord[],
      } as LevelDocument;
    }),
  };

  return resolveProperty(document);
}
