-- ============================================================
-- The home itself.
--
-- The dividing line between a table and a JSONB column is whether anything
-- else points at it. Rooms are pointed at constantly — a chore belongs to one,
-- the room tint and the floating labels key off room identity — so they need
-- real rows and referential integrity. Walls, openings, stairs and furniture
-- are pointed at by nothing: they are read wholesale to build the scene and
-- never queried individually, so splitting twenty-six walls across three
-- tables would buy constraints we already get from a schema and cost a
-- multi-way join on every load.
-- ============================================================

create table properties (
  id              uuid primary key default gen_random_uuid(),
  -- NULL means a public starter template, readable by anyone signed in.
  household_id    uuid references households on delete cascade,
  name            text not null check (length(trim(name)) between 1 and 120),
  subtitle        text not null default '',
  floor_area_sqm  numeric not null default 0 check (floor_area_sqm >= 0),
  -- Wall thicknesses a new wall starts at, in metres.
  exterior_m      numeric not null default 0.25 check (exterior_m > 0),
  interior_m      numeric not null default 0.12 check (interior_m > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index properties_household_idx on properties (household_id);

create table levels (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid not null references properties on delete cascade,
  name         text not null check (length(trim(name)) between 1 and 120),
  -- The flat is 1; the stair goes down to a floor numbered 0.
  ordinal      int not null,
  ceiling_m    numeric not null default 2.55 check (ceiling_m > 0 and ceiling_m <= 20),
  -- { nodes, walls, stairs, furniture, bay } — see geometry/schema.ts.
  geometry     jsonb not null,
  updated_at   timestamptz not null default now(),
  unique (property_id, ordinal)
);

create table rooms (
  id            uuid primary key default gen_random_uuid(),
  level_id      uuid not null references levels on delete cascade,
  -- Stable and human-readable. Chores pointed at this before they had ids.
  slug          text not null check (slug ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  name          text not null check (length(trim(name)) between 1 and 120),
  dims_label    text not null default '',
  area_sqm      numeric not null default 0 check (area_sqm >= 0),
  floor_colour  int not null check (floor_colour between 0 and 16777215),
  -- { rects, polys } — the outline the floor is extruded from.
  shapes        jsonb not null default '{"rects":[],"polys":[]}'::jsonb,
  label_at      jsonb not null,
  camera_view   jsonb not null,
  sort          int not null default 0,
  unique (level_id, slug)
);

create index rooms_level_idx on rooms (level_id);

-- ------------------------------------------------------------
-- Geometry that a person authored is untrusted input, so the hard errors from
-- the Zod schema are mirrored here. A bad document cannot land whichever route
-- it takes — the app, a script, or psql.
--
-- Only errors, never warnings. Overlapping openings and half-drawn rooms are
-- legitimate states to pass through while editing, and a database that refuses
-- to store them would make the editor unusable.
-- ------------------------------------------------------------
create or replace function validate_geometry()
returns trigger
language plpgsql
as $$
declare
  node_ids   text[];
  wall_ids   text[];
  wall       jsonb;
  opening    jsonb;
  from_node  jsonb;
  to_node    jsonb;
  wall_len   numeric;
begin
  if jsonb_typeof(new.geometry) is distinct from 'object' then
    raise exception 'geometry must be an object';
  end if;
  if jsonb_typeof(new.geometry -> 'nodes') is distinct from 'array' then
    raise exception 'geometry.nodes must be an array';
  end if;
  if jsonb_typeof(new.geometry -> 'walls') is distinct from 'array' then
    raise exception 'geometry.walls must be an array';
  end if;

  select array_agg(n ->> 'id') into node_ids
    from jsonb_array_elements(new.geometry -> 'nodes') n;
  node_ids := coalesce(node_ids, array[]::text[]);

  if array_length(node_ids, 1) is distinct from
     array_length(array(select distinct unnest(node_ids)), 1) then
    raise exception 'two corners share an id';
  end if;

  select array_agg(w ->> 'id') into wall_ids
    from jsonb_array_elements(new.geometry -> 'walls') w;
  wall_ids := coalesce(wall_ids, array[]::text[]);

  if array_length(wall_ids, 1) is distinct from
     array_length(array(select distinct unnest(wall_ids)), 1) then
    raise exception 'two walls share an id';
  end if;

  for wall in select * from jsonb_array_elements(new.geometry -> 'walls') loop
    if (wall ->> 'thickness')::numeric <= 0 then
      raise exception 'wall % has no thickness', wall ->> 'id';
    end if;

    select n into from_node from jsonb_array_elements(new.geometry -> 'nodes') n
      where n ->> 'id' = wall ->> 'from';
    select n into to_node from jsonb_array_elements(new.geometry -> 'nodes') n
      where n ->> 'id' = wall ->> 'to';

    if from_node is null or to_node is null then
      raise exception 'wall % is pinned to a corner that does not exist', wall ->> 'id';
    end if;

    wall_len := sqrt(
      power((to_node ->> 'x')::numeric - (from_node ->> 'x')::numeric, 2) +
      power((to_node ->> 'y')::numeric - (from_node ->> 'y')::numeric, 2)
    );
    if wall_len < 1e-6 then
      raise exception 'wall % starts and ends in the same place', wall ->> 'id';
    end if;

    for opening in
      select * from jsonb_array_elements(coalesce(wall -> 'openings', '[]'::jsonb))
    loop
      if (opening ->> 'from')::numeric >= (opening ->> 'to')::numeric then
        raise exception 'opening % has no width', opening ->> 'id';
      end if;
      if (opening ->> 'sill')::numeric >= (opening ->> 'head')::numeric then
        raise exception 'opening % has no height', opening ->> 'id';
      end if;
      if (opening ->> 'to')::numeric > wall_len + 1e-6 then
        raise exception 'opening % runs past the end of wall %',
          opening ->> 'id', wall ->> 'id';
      end if;
      if (opening ->> 'head')::numeric > new.ceiling_m + 1e-6 then
        raise exception 'opening % is taller than the ceiling', opening ->> 'id';
      end if;
    end loop;
  end loop;

  new.updated_at := now();
  return new;
end;
$$;

create trigger levels_validate_geometry
  before insert or update on levels
  for each row execute function validate_geometry();

create trigger properties_touch before update on properties
  for each row execute function touch_updated_at();

-- ------------------------------------------------------------
-- Row-level security
--
-- Levels and rooms reach the household through properties rather than
-- carrying a duplicate household_id that could drift out of step.
-- ------------------------------------------------------------
alter table properties enable row level security;
alter table levels enable row level security;
alter table rooms enable row level security;

-- Templates (household_id is null) are readable by anyone signed in and
-- writable by nobody.
create policy property_select on properties for select to authenticated
  using (household_id is null or household_id in (select my_households()));

create policy property_write on properties for all to authenticated
  using (household_id in (select my_households()))
  with check (household_id in (select my_households()));

create policy level_select on levels for select to authenticated
  using (
    property_id in (
      select id from properties
      where household_id is null or household_id in (select my_households())
    )
  );

create policy level_write on levels for all to authenticated
  using (property_id in (select id from properties where household_id in (select my_households())))
  with check (property_id in (select id from properties where household_id in (select my_households())));

create policy room_select on rooms for select to authenticated
  using (
    level_id in (
      select l.id from levels l
      join properties p on p.id = l.property_id
      where p.household_id is null or p.household_id in (select my_households())
    )
  );

create policy room_write on rooms for all to authenticated
  using (
    level_id in (
      select l.id from levels l
      join properties p on p.id = l.property_id
      where p.household_id in (select my_households())
    )
  )
  with check (
    level_id in (
      select l.id from levels l
      join properties p on p.id = l.property_id
      where p.household_id in (select my_households())
    )
  );
