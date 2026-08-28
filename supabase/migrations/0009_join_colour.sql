-- ============================================================
-- Give a joining member a colour nobody else has.
--
-- The colour is how the app says who a job belongs to, so two people sharing
-- one makes the task stripes, the timeline lanes and the floor tint unreadable.
-- The Split tab already refuses to let you pick a colour someone else has;
-- joining used to hand out a hardcoded one, which a third person would collide
-- with immediately.
--
-- The palette is passed in rather than duplicated here: it lives in
-- src/data/palette.ts, where the contrast and distinctness are tested, and a
-- second copy in SQL is the one that would drift.
-- ============================================================

drop function if exists join_household(text, text, text);

create or replace function join_household(
  invite_code  text,
  display_name text,
  palette      text[] default array['#E8B93E', '#5FA394']
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invite     household_invites%rowtype;
  new_member uuid;
  chosen     text;
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
    -- First colour in the palette that nobody in this household is using.
    select c into chosen
      from unnest(palette) as c
      where upper(c) not in (
        select upper(m.colour) from members m where m.household_id = invite.household_id
      )
      limit 1;

    insert into members (household_id, user_id, display_name, colour)
    values (
      invite.household_id,
      auth.uid(),
      display_name,
      coalesce(chosen, palette[1], '#5FA394')
    )
    returning id into new_member;
  end if;

  update household_invites hi
    set claimed_at = now(), claimed_by = new_member
    where hi.code = invite.code;

  return invite.household_id;
end;
$$;

revoke all on function join_household(text, text, text[]) from public;
grant execute on function join_household(text, text, text[]) to authenticated;
