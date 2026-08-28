-- ============================================================
-- Seeding a new household with a home and a starter chore list.
--
-- Takes the property document and the chore list as arguments rather than
-- carrying a copy of the example home in SQL: the client already holds the
-- validated document, and a second copy here would be the one that goes stale.
-- ============================================================

create or replace function seed_property(
  target_household uuid,
  document         jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_property uuid;
  new_level    uuid;
  level_doc    jsonb;
  room_doc     jsonb;
  sort_index   int;
begin
  if not exists (
    select 1 from members where household_id = target_household and user_id = auth.uid()
  ) then
    raise exception 'you are not in that household';
  end if;

  insert into properties (household_id, name, subtitle, floor_area_sqm, exterior_m, interior_m)
  values (
    target_household,
    document ->> 'name',
    coalesce(document ->> 'subtitle', ''),
    coalesce((document -> 'floorAreaSqm')::numeric, 0),
    coalesce((document -> 'defaults' ->> 'exterior')::numeric, 0.25),
    coalesce((document -> 'defaults' ->> 'interior')::numeric, 0.12)
  )
  returning id into new_property;

  for level_doc in select * from jsonb_array_elements(document -> 'levels') loop
    insert into levels (property_id, name, ordinal, ceiling_m, geometry)
    values (
      new_property,
      level_doc ->> 'name',
      (level_doc ->> 'ordinal')::int,
      (level_doc ->> 'ceiling')::numeric,
      -- Rooms are relational; everything else is the level's document.
      jsonb_build_object(
        'nodes',     coalesce(level_doc -> 'nodes', '[]'::jsonb),
        'walls',     coalesce(level_doc -> 'walls', '[]'::jsonb),
        'stairs',    coalesce(level_doc -> 'stairs', '[]'::jsonb),
        'furniture', coalesce(level_doc -> 'furniture', '[]'::jsonb),
        'bay',       coalesce(level_doc -> 'bay', '[]'::jsonb)
      )
    )
    returning id into new_level;

    sort_index := 0;
    for room_doc in select * from jsonb_array_elements(level_doc -> 'rooms') loop
      insert into rooms (
        level_id, slug, name, dims_label, area_sqm, floor_colour, shapes,
        label_at, camera_view, sort
      )
      values (
        new_level,
        room_doc ->> 'slug',
        room_doc ->> 'name',
        coalesce(room_doc ->> 'dimsLabel', ''),
        coalesce((room_doc -> 'areaSqm')::numeric, 0),
        (room_doc -> 'floorColour')::int,
        jsonb_build_object(
          'rects', coalesce(room_doc -> 'rects', '[]'::jsonb),
          'polys', coalesce(room_doc -> 'polys', '[]'::jsonb)
        ),
        room_doc -> 'labelAt',
        room_doc -> 'cameraView',
        sort_index
      );
      sort_index := sort_index + 1;
    end loop;
  end loop;

  return new_property;
end;
$$;

-- ------------------------------------------------------------
-- The starter chore list, resolved against the rooms just created.
--
-- `room_slug` is null for whole-home jobs. A chore naming a room the property
-- does not have becomes a whole-home chore rather than being dropped, so a
-- list written for a two-bedroom flat still mostly works in a studio.
-- ------------------------------------------------------------
create or replace function seed_chores(
  target_household uuid,
  target_property  uuid,
  chore_list       jsonb
)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  chore_doc jsonb;
  matched   uuid;
  added     int := 0;
begin
  if not exists (
    select 1 from members where household_id = target_household and user_id = auth.uid()
  ) then
    raise exception 'you are not in that household';
  end if;

  for chore_doc in select * from jsonb_array_elements(chore_list) loop
    matched := null;
    if chore_doc ->> 'room' is not null then
      select r.id into matched
        from rooms r
        join levels l on l.id = r.level_id
        where l.property_id = target_property and r.slug = chore_doc ->> 'room'
        limit 1;
    end if;

    insert into chores (household_id, room_id, name, mins, cadence, noisy, grim, seed_key)
    values (
      target_household,
      matched,
      chore_doc ->> 'name',
      (chore_doc ->> 'mins')::int,
      chore_doc ->> 'cadence',
      coalesce((chore_doc ->> 'noisy')::bool, false),
      coalesce((chore_doc ->> 'grim')::bool, false),
      chore_doc ->> 'key'
    )
    -- Re-seeding never duplicates a job the household already has.
    on conflict (household_id, seed_key) do nothing;

    added := added + 1;
  end loop;

  return added;
end;
$$;

-- A person's availability grid, written in one call rather than 126 inserts.
create or replace function set_availability(target_member uuid, slots jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  written int;
begin
  if not exists (
    select 1 from members m
    where m.id = target_member
      and m.household_id in (select household_id from members where user_id = auth.uid())
  ) then
    raise exception 'that is not your household';
  end if;

  delete from availability where member_id = target_member;

  insert into availability (member_id, dow, hour)
  select target_member, (slot ->> 0)::smallint, (slot ->> 1)::smallint
  from jsonb_array_elements(slots) slot;

  get diagnostics written = row_count;
  return written;
end;
$$;

revoke all on function seed_property(uuid, jsonb) from public;
revoke all on function seed_chores(uuid, uuid, jsonb) from public;
revoke all on function set_availability(uuid, jsonb) from public;
grant execute on function seed_property(uuid, jsonb) to authenticated;
grant execute on function seed_chores(uuid, uuid, jsonb) to authenticated;
grant execute on function set_availability(uuid, jsonb) to authenticated;
