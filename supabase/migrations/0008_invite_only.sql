-- ============================================================
-- Invite-only.
--
-- Until now any signed-in caller could create a household, which meant anyone
-- who found the URL could help themselves. Two kinds of invite now exist and
-- there is no way in without one:
--
--   founder invite   lets you start a household. Minted by hand, by whoever
--                    runs the project. Not reachable through the API at all.
--   household invite lets you join an existing one. Minted from inside the
--                    app by a member, as a link.
--
-- Enforced in the database rather than the interface, because the publishable
-- key is public and anyone can call the REST API directly.
-- ============================================================

create table founder_invites (
  code        text primary key check (code ~ '^[A-Z0-9]{6,16}$'),
  -- Who it was meant for, in a human's words. Never shown to the claimant.
  note        text,
  -- Optionally lock a code to one address, so a leaked link is still useless.
  email       text,
  expires_at  timestamptz not null,
  claimed_at  timestamptz,
  claimed_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

-- RLS on, and deliberately no policies: nobody reads or writes this through
-- the API. Only the security-definer functions below ever touch it.
alter table founder_invites enable row level security;

-- Belt as well as braces. RLS with no policies already returns nothing, but
-- Supabase grants new tables to anon and authenticated by default, so the
-- privilege is revoked outright: a policy added here by accident later cannot
-- quietly open the table up.
revoke all on table founder_invites from anon, authenticated;

-- ------------------------------------------------------------
-- Starting a household now costs a founder invite.
--
-- The old three-argument version is dropped rather than left alongside: an
-- overload that skipped the check would make the check pointless.
-- ------------------------------------------------------------
drop function if exists create_household(text, text, text);

create or replace function create_household(
  household_name text,
  display_name   text,
  invite_code    text,
  colour         text default '#E8B93E'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite        founder_invites%rowtype;
  caller_email  text;
  new_household uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select * into invite from founder_invites fi
    where fi.code = upper(trim(invite_code)) for update;

  caller_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  -- One message for every kind of failure, so the endpoint cannot be used to
  -- work out which codes exist.
  if invite is null
     or invite.claimed_at is not null
     or invite.expires_at < now()
     or (invite.email is not null and lower(invite.email) is distinct from caller_email)
  then
    raise exception 'that invite is not valid';
  end if;

  insert into households (name) values (household_name)
  returning id into new_household;

  insert into members (household_id, user_id, display_name, colour)
  values (new_household, auth.uid(), display_name, colour);

  update founder_invites fi
    set claimed_at = now(), claimed_by = auth.uid()
    where fi.code = invite.code;

  return new_household;
end;
$$;

revoke all on function create_household(text, text, text, text) from public;
grant execute on function create_household(text, text, text, text) to authenticated;

-- ------------------------------------------------------------
-- Minting a founder invite.
--
-- Not granted to `authenticated`: this is run from the SQL editor or with the
-- service key by whoever runs the project. If it were callable from the app,
-- anyone could mint themselves a way in.
--
--   select mint_founder_invite('for Sam', 'sam@example.com');
-- ------------------------------------------------------------
create or replace function mint_founder_invite(
  note      text default null,
  email     text default null,
  valid_for interval default '14 days'
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..10 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from founder_invites fi where fi.code = candidate);
  end loop;

  insert into founder_invites (code, note, email, expires_at)
  values (candidate, note, email, now() + valid_for);
  return candidate;
end;
$$;

revoke all on function mint_founder_invite(text, text, interval) from public;
revoke all on function mint_founder_invite(text, text, interval) from anon, authenticated;

-- ------------------------------------------------------------
-- Household invites become links, so they need to be readable back.
--
-- A member can see the codes their household has issued, in order to show or
-- re-copy the link. Nobody outside can see anything.
-- ------------------------------------------------------------
create or replace function household_invite_link(target_household uuid)
returns table (code text, expires_at timestamptz, claimed_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select hi.code, hi.expires_at, hi.claimed_at
  from household_invites hi
  where hi.household_id = target_household
    and exists (
      select 1 from members m
      where m.household_id = target_household and m.user_id = auth.uid()
    )
    and hi.claimed_at is null
    and hi.expires_at > now()
  order by hi.expires_at desc
  limit 1
$$;

revoke all on function household_invite_link(uuid) from public;
grant execute on function household_invite_link(uuid) to authenticated;
