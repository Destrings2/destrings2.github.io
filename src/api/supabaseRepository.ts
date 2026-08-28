import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { emptyGrid } from '@/data/defaultAvailability';
import { H0, HN } from '@/domain/time';
import type { Cadence, Chore, HourGrid, Overrides, PersonId } from '@/domain/types';
import { DEFAULT_CONFIG } from '@/domain/types';
import type { Change, Repository } from '@/store/repository';
import type { HouseholdState, StoredWeek, TintMode } from '@/store/types';

const PALETTE = ['#E8B93E', '#5FA394', '#B47CC7', '#D97C5A'];

interface Row {
  member: { id: string; display_name: string; colour: string; user_id: string };
  chore: {
    id: string;
    room_id: string | null;
    name: string;
    mins: number;
    cadence: Cadence;
    noisy: boolean;
    grim: boolean;
    preferred_by: string | null;
    enabled: boolean;
    seed_key: string | null;
  };
  week: { week_start: string; plan: unknown; meta: unknown; generated_at: string };
  override: {
    week_start: string;
    occurrence_key: string;
    member_id: string | null;
    day: number | null;
    at_minutes: number | null;
    skipped: boolean;
  };
  completion: {
    week_start: string;
    occurrence_key: string;
    chore_id: string | null;
    member_id: string;
    mins: number;
  };
}

/**
 * The household, in Postgres.
 *
 * Reads assemble the same HouseholdState the UI has always had, so nothing
 * above this file knows which repository it is talking to. Writes are
 * targeted: `commit` is told what moved and sends only that.
 */
export function supabaseRepository(client: SupabaseClient, householdId: string): Repository {
  let channel: RealtimeChannel | null = null;

  /**
   * Room ids inside and outside the database are deliberately different.
   *
   * Postgres wants a real foreign key, so chores.room_id is a uuid. The scene
   * tints floors and hangs labels by slug, because that is what the geometry
   * document is written in. Translating at this boundary keeps both honest and
   * means nothing above this file had to change when the backend arrived.
   */
  let slugById = new Map<string, string>();
  let idBySlug = new Map<string, string>();

  async function loadRoomMap() {
    const { data } = await client
      .from('rooms')
      .select('id, slug, levels!inner(properties!inner(household_id))')
      .eq('levels.properties.household_id', householdId);
    slugById = new Map(((data ?? []) as { id: string; slug: string }[]).map((r) => [r.id, r.slug]));
    idBySlug = new Map([...slugById].map(([id, slug]) => [slug, id]));
  }

  const CHORE_COLUMNS = 'id, room_id, name, mins, cadence, noisy, grim, enabled, seed_key';

  /**
   * Read the jobs, tolerating a database that has not caught up.
   *
   * Pages deploys on push; migrations are applied by hand, so the client can
   * be a release ahead of the schema. Naming a column that does not exist yet
   * fails the whole select, and reading that as "no jobs" is how a missing
   * migration came to look like an empty household. A preference is worth
   * nothing next to that, so it is asked for separately and given up on.
   */
  async function choresFor(id: string) {
    const withPreference = await client
      .from('chores')
      .select(`${CHORE_COLUMNS}, preferred_by`)
      .eq('household_id', id)
      .is('deleted_at', null)
      .order('created_at');

    // 42703: undefined_column. Anything else is a real failure and is raised.
    if (!withPreference.error || withPreference.error.code !== '42703') return withPreference;

    return client
      .from('chores')
      .select(CHORE_COLUMNS)
      .eq('household_id', id)
      .is('deleted_at', null)
      .order('created_at');
  }

  async function load(): Promise<HouseholdState | null> {
    await loadRoomMap();
    const [household, members, chores, availability, weeks, overrides, completions] =
      await Promise.all([
        client
          .from('households')
          .select('id, name, daily_cap, tint')
          .eq('id', householdId)
          .single(),
        client
          .from('members')
          .select('id, display_name, colour, user_id')
          .eq('household_id', householdId)
          .order('created_at'),
        choresFor(householdId),
        client.from('availability').select('member_id, dow, hour'),
        client
          .from('week_plans')
          .select('week_start, plan, meta, generated_at')
          .eq('household_id', householdId),
        client
          .from('overrides')
          .select('week_start, occurrence_key, member_id, day, at_minutes, skipped')
          .eq('household_id', householdId),
        client
          .from('completions')
          .select('week_start, occurrence_key, chore_id, member_id, mins')
          .eq('household_id', householdId),
      ]);

    if (household.error || !household.data) return null;

    // A failed read is not an empty household. Swallowing these with `?? []`
    // is what let a missing column present itself as a week with no jobs in
    // it, no minutes left, and nothing to show.
    for (const [what, result] of [
      ['members', members],
      ['jobs', chores],
      ['availability', availability],
      ['weeks', weeks],
      ['overrides', overrides],
      ['completions', completions],
    ] as const) {
      if (result.error) {
        throw new Error(`Could not read the ${what}: ${result.error.message}`);
      }
    }

    const memberRows = (members.data ?? []) as Row['member'][];
    const people = memberRows.map((m, index) => ({
      id: m.id,
      name: m.display_name,
      colour: m.colour || PALETTE[index % PALETTE.length]!,
    }));

    const grids: Record<PersonId, HourGrid> = {};
    for (const person of people) grids[person.id] = emptyGrid();
    for (const slot of (availability.data ?? []) as {
      member_id: string;
      dow: number;
      hour: number;
    }[]) {
      const grid = grids[slot.member_id];
      const hourIndex = slot.hour - H0;
      if (grid && hourIndex >= 0 && hourIndex < HN) grid[slot.dow]![hourIndex] = true;
    }

    // The running total and the grim-job rotation are aggregates over
    // completions, never counters. Computed here rather than read from the
    // views so that one round trip covers both.
    const ledger: Record<PersonId, number> = {};
    for (const person of people) ledger[person.id] = 0;
    const lastDoneBy: Record<string, PersonId> = {};
    const doneByWeek = new Map<string, string[]>();

    for (const row of (completions.data ?? []) as Row['completion'][]) {
      ledger[row.member_id] = (ledger[row.member_id] ?? 0) + row.mins;
      if (row.chore_id) lastDoneBy[row.chore_id] = row.member_id;
      const list = doneByWeek.get(row.week_start) ?? [];
      list.push(row.occurrence_key);
      doneByWeek.set(row.week_start, list);
    }

    const overridesByWeek = new Map<string, Overrides>();
    for (const row of (overrides.data ?? []) as Row['override'][]) {
      const forWeek = overridesByWeek.get(row.week_start) ?? {};
      forWeek[row.occurrence_key] = {
        personId: row.member_id,
        day: row.day,
        at: row.at_minutes,
        skip: row.skipped,
      };
      overridesByWeek.set(row.week_start, forWeek);
    }

    const storedWeeks: Record<string, StoredWeek> = {};
    for (const row of (weeks.data ?? []) as Row['week'][]) {
      storedWeeks[row.week_start] = {
        plan: row.plan as StoredWeek['plan'],
        meta: row.meta as StoredWeek['meta'],
        done: doneByWeek.get(row.week_start) ?? [],
        overrides: overridesByWeek.get(row.week_start) ?? {},
        generatedAt: new Date(row.generated_at).getTime(),
      };
    }

    const settings = household.data as { name: string; daily_cap: number; tint: TintMode };

    return {
      version: 1,
      people,
      chores: ((chores.data ?? []) as Row['chore'][]).map((c): Chore => ({
        id: c.id,
        // Slug outside, uuid inside.
        roomId: c.room_id ? (slugById.get(c.room_id) ?? null) : null,
        name: c.name,
        mins: c.mins,
        cadence: c.cadence,
        noisy: c.noisy,
        grim: c.grim,
        preferredBy: c.preferred_by ?? null,
        enabled: c.enabled,
      })),
      availability: grids,
      weeks: storedWeeks,
      ledger,
      lastDoneBy,
      settings: {
        dailyCap: settings.daily_cap ?? DEFAULT_CONFIG.dailyCap,
        tint: settings.tint ?? 'load',
      },
      named: true,
    };
  }

  /**
   * supabase-js reports a failed write by returning an error, not by
   * throwing. Every write here awaited the result and looked no further, so
   * a refused or failed write was indistinguishable from a successful one:
   * the outbox was told it had landed, dropped it, and never retried. The
   * edit then survived only until the next read, which put the server's older
   * version back — a cell in the free-time grid that turned on and then
   * quietly turned itself off again.
   *
   * Nothing here is allowed to ignore an error now, so a write that fails is
   * retried, and one that keeps failing says so.
   */
  async function must<T extends { error: unknown }>(result: PromiseLike<T>): Promise<T> {
    const settled = await result;
    const error = settled.error as { message?: string; code?: string } | null;
    if (error) {
      // `||` not `??`: an error with an empty message would otherwise throw
      // an Error saying nothing at all.
      throw new Error(error.message || `write refused (${error.code || 'unknown'})`);
    }
    return settled;
  }

  async function commit(state: HouseholdState, change: Change): Promise<void> {
    switch (change.kind) {
      case 'settings':
        await must(
          client
            .from('households')
            .update({ daily_cap: state.settings.dailyCap, tint: state.settings.tint })
            .eq('id', householdId),
        );
        return;

      case 'members':
        // Each one checked. These run in parallel, so the await is on the
        // Promise.all rather than on the calls themselves — which is exactly
        // how this branch escaped the first pass at checking errors.
        await Promise.all(
          state.people.map((person) =>
            must(
              client
                .from('members')
                .update({ display_name: person.name, colour: person.colour })
                .eq('id', person.id),
            ),
          ),
        );
        return;

      case 'chore': {
        if (change.op === 'remove') {
          // Soft delete: a hard one resurrects on the other device.
          await must(
            client
              .from('chores')
              .update({ deleted_at: new Date().toISOString() })
              .eq('id', change.id)
              .eq('household_id', householdId),
          );
          return;
        }

        const chore = state.chores.find((c) => c.id === change.id);
        if (!chore) return;

        const row = {
          household_id: householdId,
          room_id: chore.roomId ? (idBySlug.get(chore.roomId) ?? null) : null,
          name: chore.name,
          mins: chore.mins,
          cadence: chore.cadence,
          noisy: chore.noisy,
          grim: chore.grim,
          preferred_by: chore.preferredBy,
          enabled: chore.enabled,
        };

        if (change.op === 'add') {
          // Upsert rather than insert: a retried write after a response that
          // never arrived must not create the chore twice.
          await must(client.from('chores').upsert({ id: chore.id, ...row }));
          return;
        }

        await must(
          client.from('chores').update(row).eq('id', change.id).eq('household_id', householdId),
        );
        return;
      }

      case 'availability': {
        const grid = state.availability[change.personId] ?? [];
        const slots: [number, number][] = [];
        grid.forEach((day, dow) =>
          day.forEach((on, index) => {
            if (on) slots.push([dow, H0 + index]);
          }),
        );
        await must(client.rpc('set_availability', { target_member: change.personId, slots }));
        return;
      }

      case 'week': {
        const week = state.weeks[change.weekKey];
        if (!week) return;
        await must(
          client.from('week_plans').upsert({
            household_id: householdId,
            week_start: change.weekKey,
            plan: week.plan,
            meta: week.meta,
            generated_at: new Date(week.generatedAt).toISOString(),
          }),
        );
        return;
      }

      case 'override': {
        const week = state.weeks[change.weekKey];
        const override = week?.overrides[change.occurrence];
        if (!override) {
          await must(
            client
              .from('overrides')
              .delete()
              .eq('household_id', householdId)
              .eq('week_start', change.weekKey)
              .eq('occurrence_key', change.occurrence),
          );
          return;
        }
        await must(
          client.from('overrides').upsert({
            household_id: householdId,
            week_start: change.weekKey,
            occurrence_key: change.occurrence,
            member_id: override.personId,
            day: override.day,
            at_minutes: override.at,
            skipped: override.skip,
            source: 'app',
          }),
        );
        return;
      }

      case 'completion': {
        if (!change.added) {
          await must(
            client
              .from('completions')
              .delete()
              .eq('household_id', householdId)
              .eq('week_start', change.weekKey)
              .eq('occurrence_key', change.occurrence),
          );
          return;
        }
        const entry = state.weeks[change.weekKey]?.plan.find((e) => e.key === change.occurrence);
        if (!entry?.personId) return;
        await must(
          client.from('completions').upsert({
            household_id: householdId,
            week_start: change.weekKey,
            occurrence_key: change.occurrence,
            chore_id: entry.choreId,
            member_id: entry.personId,
            mins: entry.mins,
          }),
        );
        return;
      }

      case 'all':
      default:
        return;
    }
  }

  return {
    kind: 'supabase',
    load,
    commit,

    subscribe(onRemoteChange) {
      void channel?.unsubscribe();

      // One binding per table. `postgres_changes` cannot watch a whole schema:
      // without an explicit `table` the subscription is accepted, reports
      // SUBSCRIBED, and then matches nothing — which is how this went unnoticed
      // until two tabs were opened side by side.
      //
      // `availability` is keyed by member and has no household_id to filter on;
      // RLS still limits what arrives to this household's rows.
      const watched: { table: string; filter?: string }[] = [
        { table: 'week_plans', filter: `household_id=eq.${householdId}` },
        { table: 'overrides', filter: `household_id=eq.${householdId}` },
        { table: 'completions', filter: `household_id=eq.${householdId}` },
        { table: 'chores', filter: `household_id=eq.${householdId}` },
        { table: 'members', filter: `household_id=eq.${householdId}` },
        { table: 'households', filter: `id=eq.${householdId}` },
        { table: 'availability' },
      ];

      let next = client.channel(`household:${householdId}`);
      for (const { table, filter } of watched) {
        // Realtime invalidates rather than patching: a change lands, the state
        // is refetched. Patching a cache by hand from a change feed is where
        // sync bugs live.
        next = next.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, ...(filter ? { filter } : {}) },
          () => onRemoteChange(),
        );
      }
      channel = next.subscribe();

      return () => {
        void channel?.unsubscribe();
        channel = null;
      };
    },

    async clear() {
      // Deliberately not implemented: wiping a shared household from one
      // device is not something to do behind the other person's back.
      throw new Error('Reset is only available on a local-only install');
    },
  };
}
