import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { STARTER_CHORES } from '../src/data/starterChores';
import { STARTER_FLAT } from '../src/data/starterFlat';
import { startHarness, type Harness } from './testing/harness';

let db: Harness;
let alice: string;
let bob: string;
let stranger: string;

beforeAll(async () => {
  db = await startHarness();
  alice = await db.createUser('alice@example.com');
  bob = await db.createUser('bob@example.com');
  stranger = await db.createUser('stranger@example.com');
}, 120_000);

afterAll(async () => {
  await db?.stop();
});

const q = <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  db.client.query<T>(sql, params).then((r) => r.rows);

/** Mint a founder invite as the project owner, the way a human would. */
async function founderCode(email: string | null = null): Promise<string> {
  const rows = await q<{ mint_founder_invite: string }>(
    `select mint_founder_invite('test', $1) as mint_founder_invite`,
    [email],
  );
  return rows[0]!.mint_founder_invite;
}

/** Start a household the way the app does: sign in, spend a founder invite. */
async function startHousehold(user: string, name: string, displayName: string): Promise<string> {
  const code = await founderCode();
  return db.as(user, async () => {
    const [row] = await q<{ create_household: string }>(
      `select create_household($1, $2, $3) as create_household`,
      [name, displayName, code],
    );
    return row!.create_household;
  });
}

describe('the migrations', () => {
  it('all apply cleanly', async () => {
    const tables = await q<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    expect(tables.map((t) => t.table_name)).toEqual([
      'availability',
      'chores',
      'completions',
      'founder_invites',
      'household_invites',
      'households',
      'levels',
      'members',
      'overrides',
      'properties',
      'rooms',
      'week_plans',
    ]);
  });

  it('leaves row-level security on for every table', async () => {
    const unprotected = await q<{ relname: string }>(
      `select c.relname from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false`,
    );
    expect(unprotected.map((r) => r.relname)).toEqual([]);
  });

  it('gives every table a policy, except the one nothing may reach', async () => {
    const bare = await q<{ tablename: string }>(
      `select t.tablename from pg_tables t
       where t.schemaname = 'public'
         and not exists (
           select 1 from pg_policies p
           where p.schemaname = 'public' and p.tablename = t.tablename
         )`,
    );
    // founder_invites has RLS on and no policies on purpose: it is reachable
    // only through the security-definer functions, never through the API.
    expect(bare.map((r) => r.tablename)).toEqual(['founder_invites']);
  });

  it('derives the ledger rather than storing a counter', async () => {
    const views = await q<{ table_name: string }>(
      `select table_name from information_schema.views
       where table_schema = 'public' order by table_name`,
    );
    expect(views.map((v) => v.table_name)).toEqual(['last_done_by', 'ledger']);
  });
});

describe('starting and joining a household', () => {
  let household: string;
  let code: string;

  it('creates a household and makes you its first member', async () => {
    household = await startHousehold(alice, 'the example home', 'Alice');
    expect(household).toMatch(/^[0-9a-f-]{36}$/);

    const members = await db.as(alice, () =>
      q<{ display_name: string }>(`select display_name from members`),
    );
    expect(members.map((m) => m.display_name)).toEqual(['Alice']);
  });

  it('spends the founder invite, so it cannot be used twice', async () => {
    const code = await founderCode();
    await db.as(bob, () => q(`select create_household('First', 'Bob', $1)`, [code]));
    await expect(
      db.as(stranger, () => q(`select create_household('Second', 'Nosey', $1)`, [code])),
    ).rejects.toThrow(/not valid/);
  });

  it('issues an invite code that reads over the phone', async () => {
    code = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    // No I, O, 0 or 1 — the shapes people misread.
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  });

  it('lets a second person join with it', async () => {
    const joined = await db.as(bob, async () => {
      const [row] = await q<{ join_household: string }>(
        `select join_household($1, 'Bob') as join_household`,
        [code],
      );
      return row!.join_household;
    });
    expect(joined).toBe(household);

    const members = await db.as(alice, () =>
      q<{ display_name: string }>(`select display_name from members order by display_name`),
    );
    expect(members.map((m) => m.display_name)).toEqual(['Alice', 'Bob']);
  });

  it('refuses a code that has already been used', async () => {
    await expect(
      db.as(stranger, () => q(`select join_household($1, 'Nosey')`, [code])),
    ).rejects.toThrow(/not valid/);
  });

  it('refuses a code that never existed, saying nothing about which', async () => {
    await expect(
      db.as(stranger, () => q(`select join_household('ZZZZZZZZ', 'Nosey')`)),
    ).rejects.toThrow(/not valid/);
  });

  it('refuses an expired code', async () => {
    const expired = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1, interval '-1 hour') as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    await expect(
      db.as(stranger, () => q(`select join_household($1, 'Nosey')`, [expired])),
    ).rejects.toThrow(/not valid/);
  });

  it('will not issue an invite to a household you are not in', async () => {
    await expect(db.as(stranger, () => q(`select create_invite($1)`, [household]))).rejects.toThrow(
      /not in that household/,
    );
  });

  it('is idempotent if you join twice', async () => {
    const second = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    await db.as(bob, () => q(`select join_household($1, 'Bob again')`, [second]));
    const members = await db.as(alice, () => q(`select id from members`));
    expect(members).toHaveLength(2);
  });
});

describe('row-level security', () => {
  let household: string;

  beforeAll(async () => {
    household = await startHousehold(alice, 'Second Home', 'Alice');
    await db.as(alice, () =>
      q(
        `insert into chores (household_id, name, mins, cadence)
         values ($1, 'Secret job', 10, 'weekly')`,
        [household],
      ),
    );
  });

  it('shows a member their own household', async () => {
    const rows = await db.as(alice, () =>
      q<{ name: string }>(`select name from households where id = $1`, [household]),
    );
    expect(rows).toHaveLength(1);
  });

  it('shows an outsider nothing at all', async () => {
    const seen = await db.as(stranger, async () => ({
      households: await q(`select * from households`),
      members: await q(`select * from members`),
      chores: await q(`select * from chores`),
      invites: await q(`select * from household_invites`),
      weeks: await q(`select * from week_plans`),
      completions: await q(`select * from completions`),
    }));
    expect(seen.households).toEqual([]);
    expect(seen.members).toEqual([]);
    expect(seen.chores).toEqual([]);
    expect(seen.invites).toEqual([]);
    expect(seen.weeks).toEqual([]);
    expect(seen.completions).toEqual([]);
  });

  it('stops an outsider writing into a household they are not in', async () => {
    await expect(
      db.as(stranger, () =>
        q(
          `insert into chores (household_id, name, mins, cadence)
           values ($1, 'Gatecrash', 10, 'weekly')`,
          [household],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('stops an outsider deleting someone else’s chore', async () => {
    await db.as(stranger, () => q(`delete from chores where household_id = $1`, [household]));
    const still = await db.as(alice, () =>
      q(`select id from chores where household_id = $1`, [household]),
    );
    expect(still).toHaveLength(1);
  });

  it('stops someone adding themselves to a household directly', async () => {
    await expect(
      db.as(stranger, () =>
        q(
          `insert into members (household_id, user_id, display_name, colour)
           values ($1, $2, 'Sneak', '#FFFFFF')`,
          [household, alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('shows a signed-out caller nothing', async () => {
    const rows = await db.anon(() => q(`select * from households`));
    expect(rows).toEqual([]);
  });

  it('does not recurse when reading members', async () => {
    // my_households() reads `members`; if it were not security definer, the
    // members policy would call it again, and again.
    const rows = await db.as(alice, () => q(`select id from members`));
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('the geometry trigger', () => {
  let household: string;
  let property: string;

  const level = () => structuredClone(STARTER_FLAT.levels[0]!);

  beforeAll(async () => {
    household = await startHousehold(alice, 'Geometry', 'Alice');
    property = await db.as(alice, async () => {
      const [row] = await q<{ id: string }>(
        `insert into properties (household_id, name) values ($1, 'Test') returning id`,
        [household],
      );
      return row!.id;
    });
  });

  const insertLevel = (geometry: unknown, ordinal: number) =>
    db.as(alice, () =>
      q(
        `insert into levels (property_id, name, ordinal, ceiling_m, geometry)
         values ($1, 'L', $2, 2.55, $3)`,
        [property, ordinal, JSON.stringify(geometry)],
      ),
    );

  const geometryOf = (l: ReturnType<typeof level>) => ({
    nodes: l.nodes,
    walls: l.walls,
    stairs: l.stairs,
    furniture: l.furniture,
    bay: l.bay,
  });

  it('accepts the real flat', async () => {
    await expect(insertLevel(geometryOf(level()), 10)).resolves.toBeDefined();
  });

  it('rejects a wall pinned to a corner that does not exist', async () => {
    const l = level();
    l.walls[0]!.from = 'nowhere';
    await expect(insertLevel(geometryOf(l), 11)).rejects.toThrow(/corner that does not exist/);
  });

  it('rejects an opening that runs off the end of its wall', async () => {
    const l = level();
    const wall = l.walls.find((w) => w.openings.length)!;
    wall.openings[0]!.to = 999;
    await expect(insertLevel(geometryOf(l), 12)).rejects.toThrow(/runs past the end/);
  });

  it('rejects an opening taller than the ceiling', async () => {
    const l = level();
    const wall = l.walls.find((w) => w.openings.length)!;
    wall.openings[0]!.head = 9;
    await expect(insertLevel(geometryOf(l), 13)).rejects.toThrow(/taller than the ceiling/);
  });

  it('rejects an opening with no width', async () => {
    const l = level();
    const wall = l.walls.find((w) => w.openings.length)!;
    wall.openings[0]!.to = wall.openings[0]!.from;
    await expect(insertLevel(geometryOf(l), 14)).rejects.toThrow(/no width/);
  });

  it('rejects a wall with both ends in the same place', async () => {
    const l = level();
    l.walls[0]!.to = l.walls[0]!.from;
    await expect(insertLevel(geometryOf(l), 15)).rejects.toThrow(/same place/);
  });

  it('rejects duplicate corner ids', async () => {
    const l = level();
    l.nodes[1]!.id = l.nodes[0]!.id;
    await expect(insertLevel(geometryOf(l), 16)).rejects.toThrow(/share an id/);
  });

  it('rejects a wall with no thickness', async () => {
    const l = level();
    l.walls[0]!.thickness = 0;
    await expect(insertLevel(geometryOf(l), 17)).rejects.toThrow(/no thickness/);
  });

  it('allows the states an editor legitimately passes through', async () => {
    // Overlapping openings are a warning in the app, never an error here: a
    // database that refused them would make the editor unusable.
    const l = level();
    const wall = l.walls.find((w) => w.openings.length)!;
    const first = wall.openings[0]!;
    wall.openings.push({ ...first, id: `${first.id}-dup`, from: first.from + 0.02 });
    await expect(insertLevel(geometryOf(l), 18)).resolves.toBeDefined();
  });
});

describe('seeding a new household', () => {
  let household: string;
  let property: string;

  it('stores the whole flat from its document', async () => {
    household = await startHousehold(bob, 'Seeded', 'Bob');

    property = await db.as(bob, async () => {
      const [row] = await q<{ seed_property: string }>(
        `select seed_property($1, $2::jsonb) as seed_property`,
        [household, JSON.stringify(STARTER_FLAT)],
      );
      return row!.seed_property;
    });
    expect(property).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('splits rooms into rows and keeps the rest as the level document', async () => {
    const rooms = await db.as(bob, () =>
      q<{ slug: string; name: string }>(
        `select r.slug, r.name from rooms r
         join levels l on l.id = r.level_id
         where l.property_id = $1 order by r.sort`,
        [property],
      ),
    );
    expect(rooms.map((r) => r.slug)).toEqual(['living', 'kitchen', 'bedroom', 'bath']);

    const [level] = await db.as(bob, () =>
      q<{ nodes: number; walls: number; furniture: number }>(
        `select jsonb_array_length(geometry -> 'nodes') as nodes,
                jsonb_array_length(geometry -> 'walls') as walls,
                jsonb_array_length(geometry -> 'furniture') as furniture
         from levels where property_id = $1`,
        [property],
      ),
    );
    const expected = STARTER_FLAT.levels[0]!;
    expect(level).toEqual({
      nodes: expected.nodes.length,
      walls: expected.walls.length,
      furniture: expected.furniture.length,
    });
  });

  it('seeds the chore list against the rooms it just made', async () => {
    const payload = STARTER_CHORES.map((c) => ({
      key: c.key,
      room: c.room,
      name: c.name,
      mins: c.mins,
      cadence: c.cadence,
      noisy: c.noisy ?? false,
      grim: c.grim ?? false,
    }));

    await db.as(bob, () =>
      q(`select seed_chores($1, $2, $3::jsonb)`, [household, property, JSON.stringify(payload)]),
    );

    const chores = await db.as(bob, () =>
      q<{ n: string }>(`select count(*) as n from chores where household_id = $1`, [household]),
    );
    expect(Number(chores[0]!.n)).toBe(STARTER_CHORES.length);

    // Whole-home jobs get a null room rather than a magic string.
    const [wholeHome] = await db.as(bob, () =>
      q<{ n: string }>(
        `select count(*) as n from chores where household_id = $1 and room_id is null`,
        [household],
      ),
    );
    expect(Number(wholeHome!.n)).toBe(STARTER_CHORES.filter((c) => c.room === null).length);

    const [kitchen] = await db.as(bob, () =>
      q<{ n: string }>(
        `select count(*) as n from chores c
         join rooms r on r.id = c.room_id
         where c.household_id = $1 and r.slug = 'kitchen'`,
        [household],
      ),
    );
    expect(Number(kitchen!.n)).toBe(STARTER_CHORES.filter((c) => c.room === 'kitchen').length);
  });

  it('does not duplicate a job when the seed list is applied again', async () => {
    const payload = STARTER_CHORES.map((c) => ({
      key: c.key,
      room: c.room,
      name: c.name,
      mins: c.mins,
      cadence: c.cadence,
    }));
    await db.as(bob, () =>
      q(`select seed_chores($1, $2, $3::jsonb)`, [household, property, JSON.stringify(payload)]),
    );
    const [after] = await db.as(bob, () =>
      q<{ n: string }>(`select count(*) as n from chores where household_id = $1`, [household]),
    );
    expect(Number(after!.n)).toBe(STARTER_CHORES.length);
  });

  it('will not seed into a household you are not in', async () => {
    await expect(
      db.as(stranger, () =>
        q(`select seed_property($1, $2::jsonb)`, [household, JSON.stringify(STARTER_FLAT)]),
      ),
    ).rejects.toThrow(/not in that household/);
  });

  it('writes an availability grid in one call', async () => {
    const member = await db.as(bob, async () => {
      const [row] = await q<{ id: string }>(`select id from members where household_id = $1`, [
        household,
      ]);
      return row!.id;
    });
    const slots = [
      [0, 18],
      [0, 19],
      [5, 10],
    ];
    const [written] = await db.as(bob, () =>
      q<{ set_availability: number }>(
        `select set_availability($1, $2::jsonb) as set_availability`,
        [member, JSON.stringify(slots)],
      ),
    );
    expect(written!.set_availability).toBe(3);

    // Writing again replaces rather than accumulates.
    await db.as(bob, () =>
      q(`select set_availability($1, $2::jsonb)`, [member, JSON.stringify([[1, 20]])]),
    );
    const rows = await db.as(bob, () =>
      q<{ dow: number; hour: number }>(`select dow, hour from availability where member_id = $1`, [
        member,
      ]),
    );
    expect(rows).toEqual([{ dow: 1, hour: 20 }]);
  });
});

describe('reading a home back', () => {
  // The client fetches the property, then its levels, then the rooms on those
  // levels, as three separate reads. Each one passes through its own policy,
  // so a home that seeds perfectly can still come back empty for the person
  // reading it — and the app's only signal for that is a silent fall back to
  // the starter flat. This walks the same three steps.
  async function readAsClient(user: string, household: string) {
    return db.as(user, async () => {
      const [property] = await q<{ id: string; name: string }>(
        `select id, name from properties where household_id = $1 order by created_at limit 1`,
        [household],
      );
      if (!property) return { property: null, levels: 0, rooms: [] as string[] };

      const levels = await q<{ id: string }>(
        `select id from levels where property_id = $1 order by ordinal`,
        [property.id],
      );
      const rooms = levels.length
        ? await q<{ slug: string }>(
            `select slug from rooms where level_id = any($1::uuid[]) order by sort`,
            [levels.map((l) => l.id)],
          )
        : [];
      return { property, levels: levels.length, rooms: rooms.map((r) => r.slug) };
    });
  }

  let household: string;

  beforeAll(async () => {
    household = await startHousehold(alice, 'Readable', 'Alice');
    await db.as(alice, () =>
      q(`select seed_property($1, $2::jsonb)`, [household, JSON.stringify(STARTER_FLAT)]),
    );
  });

  it('gives the founder every part of it', async () => {
    const seen = await readAsClient(alice, household);
    expect(seen.property?.name).toBe(STARTER_FLAT.name);
    expect(seen.levels).toBe(STARTER_FLAT.levels.length);
    expect(seen.rooms).toEqual(['living', 'kitchen', 'bedroom', 'bath']);
  });

  it('gives someone who joined the same home, not an empty one', async () => {
    const code = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    await db.as(bob, () => q(`select join_household($1, 'Bob')`, [code]));

    const seen = await readAsClient(bob, household);
    expect(seen.property?.name).toBe(STARTER_FLAT.name);
    expect(seen.levels).toBe(STARTER_FLAT.levels.length);
    expect(seen.rooms).toEqual(['living', 'kitchen', 'bedroom', 'bath']);
  });

  it('gives an outsider nothing, so the app shows the starter instead', async () => {
    const seen = await readAsClient(stranger, household);
    expect(seen.property).toBeNull();
  });
});

describe('the ledger', () => {
  let household: string;
  let member: string;
  let chore: string;

  beforeAll(async () => {
    household = await startHousehold(alice, 'Ledger', 'Alice');
    member = await db.as(alice, async () => {
      const [row] = await q<{ id: string }>(`select id from members where household_id = $1`, [
        household,
      ]);
      return row!.id;
    });
    chore = await db.as(alice, async () => {
      const [row] = await q<{ id: string }>(
        `insert into chores (household_id, name, mins, cadence)
         values ($1, 'Mop', 12, 'weekly') returning id`,
        [household],
      );
      return row!.id;
    });
  });

  it('adds up completions rather than counting them separately', async () => {
    await db.as(alice, () =>
      q(
        `insert into completions (household_id, week_start, occurrence_key, chore_id, member_id, mins)
         values ($1, '2026-08-24', 'k4#0', $2, $3, 12),
                ($1, '2026-08-24', 'k5#0', $2, $3, 7)`,
        [household, chore, member],
      ),
    );
    const [row] = await db.as(alice, () =>
      q<{ mins: string; jobs: string }>(`select mins, jobs from ledger where household_id = $1`, [
        household,
      ]),
    );
    expect(Number(row!.mins)).toBe(19);
    expect(Number(row!.jobs)).toBe(2);
  });

  it('falls again when a job is un-ticked', async () => {
    await db.as(alice, () =>
      q(`delete from completions where household_id = $1 and occurrence_key = 'k5#0'`, [household]),
    );
    const [row] = await db.as(alice, () =>
      q<{ mins: string }>(`select mins from ledger where household_id = $1`, [household]),
    );
    expect(Number(row!.mins)).toBe(12);
  });

  it('cannot record the same occurrence twice', async () => {
    await expect(
      db.as(alice, () =>
        q(
          `insert into completions (household_id, week_start, occurrence_key, chore_id, member_id, mins)
           values ($1, '2026-08-24', 'k4#0', $2, $3, 12)`,
          [household, chore, member],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('remembers who last did each chore, for the grim rotation', async () => {
    const [row] = await db.as(alice, () =>
      q<{ member_id: string }>(`select member_id from last_done_by where chore_id = $1`, [chore]),
    );
    expect(row!.member_id).toBe(member);
  });

  it('shows an outsider no ledger at all', async () => {
    const rows = await db.as(stranger, () => q(`select * from ledger`));
    expect(rows).toEqual([]);
  });
});

describe('realtime', () => {
  it('publishes the tables that change while both people are looking', async () => {
    const rows = await q<{ tablename: string }>(
      `select tablename from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
       order by tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'availability',
      'chores',
      'completions',
      'households',
      'members',
      'overrides',
      'week_plans',
    ]);
  });

  it('leaves geometry out — it is not edited behind your back', async () => {
    const rows = await q<{ tablename: string }>(
      `select tablename from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public'
         and tablename in ('levels', 'rooms', 'properties')`,
    );
    expect(rows).toEqual([]);
  });
});

describe('invite-only', () => {
  it('refuses to start a household without a code', async () => {
    await expect(
      db.as(stranger, () => q(`select create_household('Uninvited', 'Nosey', 'NOSUCHCODE')`)),
    ).rejects.toThrow(/not valid/);
  });

  it('refuses an expired founder invite', async () => {
    const [row] = await q<{ mint_founder_invite: string }>(
      `select mint_founder_invite('old', null, interval '-1 hour') as mint_founder_invite`,
    );
    await expect(
      db.as(stranger, () =>
        q(`select create_household('Late', 'Nosey', $1)`, [row!.mint_founder_invite]),
      ),
    ).rejects.toThrow(/not valid/);
  });

  it('honours a code locked to one address', async () => {
    const code = await founderCode('someone-else@example.com');
    await expect(
      db.as(stranger, () => q(`select create_household('Wrong hands', 'Nosey', $1)`, [code])),
    ).rejects.toThrow(/not valid/);
  });

  it('lets the address it was locked to use it', async () => {
    const invited = await db.createUser('invited@example.com');
    const code = await founderCode('invited@example.com');
    // auth.jwt() carries the email on the hosted platform; mirror that here.
    await db.client.query('begin');
    await db.client.query(`set local role authenticated`);
    await db.client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [invited]);
    await db.client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: invited, email: 'invited@example.com' }),
    ]);
    const { rows } = await db.client.query<{ create_household: string }>(
      `select create_household('Invited home', 'Invited', $1) as create_household`,
      [code],
    );
    await db.client.query('commit');
    expect(rows[0]!.create_household).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not let the app mint its own way in', async () => {
    await expect(db.as(stranger, () => q(`select mint_founder_invite('cheeky')`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('does not let anyone read the founder invite table', async () => {
    await expect(db.as(stranger, () => q(`select * from founder_invites`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('hands a member back their household invite link', async () => {
    const household = await startHousehold(alice, 'Linkable', 'Alice');
    const code = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    const rows = await db.as(alice, () =>
      q<{ code: string }>(`select code from household_invite_link($1)`, [household]),
    );
    expect(rows[0]!.code).toBe(code);
  });

  it('hands an outsider nothing, even knowing the household id', async () => {
    const household = await startHousehold(alice, 'Private', 'Alice');
    await db.as(alice, () => q(`select create_invite($1)`, [household]));
    const rows = await db.as(stranger, () =>
      q(`select code from household_invite_link($1)`, [household]),
    );
    expect(rows).toEqual([]);
  });

  it('stops offering a link once it has been claimed', async () => {
    const household = await startHousehold(alice, 'Claimed', 'Alice');
    const code = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    await db.as(stranger, () => q(`select join_household($1, 'Guest')`, [code]));
    const rows = await db.as(alice, () =>
      q(`select code from household_invite_link($1)`, [household]),
    );
    expect(rows).toEqual([]);
  });
});

describe('accent colours', () => {
  it('gives a joining member a colour nobody else has', async () => {
    const household = await startHousehold(alice, 'Colours', 'Alice');
    const palette = ['#E8B93E', '#5FA394', '#B47CC7'];

    // Alice took the first when she created it.
    await db.as(alice, () =>
      q(`update members set colour = $1 where household_id = $2`, [palette[0], household]),
    );

    const code = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    await db.as(bob, () => q(`select join_household($1, 'Bob', $2)`, [code, palette]));

    const colours = await db.as(alice, () =>
      q<{ colour: string }>(`select colour from members where household_id = $1`, [household]),
    );
    expect(new Set(colours.map((c) => c.colour.toUpperCase())).size).toBe(colours.length);
    expect(colours.map((c) => c.colour.toUpperCase())).toContain('#5FA394');
  });

  it('falls back rather than failing when every colour is taken', async () => {
    const household = await startHousehold(alice, 'Crowded', 'Alice');
    const code = await db.as(alice, async () => {
      const [row] = await q<{ create_invite: string }>(
        `select create_invite($1) as create_invite`,
        [household],
      );
      return row!.create_invite;
    });
    // Offer only the colour Alice already has.
    const [alicesColour] = await db.as(alice, () =>
      q<{ colour: string }>(`select colour from members where household_id = $1`, [household]),
    );
    await db.as(bob, () =>
      q(`select join_household($1, 'Bob', $2)`, [code, [alicesColour!.colour]]),
    );
    const members = await db.as(alice, () =>
      q(`select id from members where household_id = $1`, [household]),
    );
    expect(members).toHaveLength(2);
  });
});
