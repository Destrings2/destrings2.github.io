-- ============================================================
-- The two operations a client cannot do safely with plain inserts:
-- starting a household, and joining someone else's.
--
-- Both run as definer because they legitimately need to touch rows the caller
-- cannot yet see — you are not a member of a household until the moment you
-- are — and both check the caller's own identity before doing anything.
-- ============================================================

create or replace function create_household(
  household_name text,
  display_name   text,
  colour         text default '#E8B93E'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_household uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  insert into households (name) values (household_name)
  returning id into new_household;

  insert into members (household_id, user_id, display_name, colour)
  values (new_household, auth.uid(), display_name, colour);

  return new_household;
end;
$$;

-- ------------------------------------------------------------
-- Invite codes.
--
-- Short enough to read down the phone, long enough not to be guessed at the
-- rate an anonymous caller could try: 8 characters from a 32-letter alphabet
-- with the shapes that get misread — I, O, 0, 1 — left out.
-- ------------------------------------------------------------
create or replace function generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  -- Not named `code`: plpgsql would not know whether a bare `code` in a query
  -- meant the variable or the household_invites column of the same name.
  candidate text;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from household_invites hi where hi.code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function create_invite(target_household uuid, valid_for interval default '7 days')
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inviter   uuid;
  new_code  text;
begin
  select id into inviter from members
    where household_id = target_household and user_id = auth.uid();
  if inviter is null then
    raise exception 'you are not in that household';
  end if;

  new_code := generate_invite_code();
  insert into household_invites (code, household_id, created_by, expires_at)
  values (new_code, target_household, inviter, now() + valid_for);
  return new_code;
end;
$$;

create or replace function join_household(
  invite_code  text,
  display_name text,
  colour       text default '#5FA394'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite     household_invites%rowtype;
  new_member uuid;
begin
  if auth.uid() is null then
    raise exception 'sign in first';
  end if;

  select * into invite from household_invites hi
    where hi.code = upper(trim(invite_code)) for update;

  -- One message for every failure, so the endpoint cannot be used to work out
  -- which codes exist.
  if invite is null or invite.claimed_at is not null or invite.expires_at < now() then
    raise exception 'that invite is not valid';
  end if;

  -- Already in it: succeed quietly rather than erroring on a second tap.
  select id into new_member from members
    where household_id = invite.household_id and user_id = auth.uid();

  if new_member is null then
    insert into members (household_id, user_id, display_name, colour)
    values (invite.household_id, auth.uid(), display_name, colour)
    returning id into new_member;
  end if;

  update household_invites hi
    set claimed_at = now(), claimed_by = new_member
    where hi.code = invite.code;

  return invite.household_id;
end;
$$;

revoke all on function create_household(text, text, text) from public;
revoke all on function create_invite(uuid, interval) from public;
revoke all on function join_household(text, text, text) from public;
grant execute on function create_household(text, text, text) to authenticated;
grant execute on function create_invite(uuid, interval) to authenticated;
grant execute on function join_household(text, text, text) to authenticated;
