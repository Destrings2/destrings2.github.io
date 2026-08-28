import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { Client } from 'pg';

const ROOT = join(process.cwd(), 'supabase');
const DATA_DIR = join(process.cwd(), 'node_modules', '.cache', 'rota-pg');

export interface Harness {
  client: Client;
  /** Run `work` as a signed-in user, then drop back to the owning role. */
  as<T>(userId: string, work: () => Promise<T>, email?: string): Promise<T>;
  /** Run as the anonymous role — signed out. */
  anon<T>(work: () => Promise<T>): Promise<T>;
  createUser(email: string): Promise<string>;
  stop(): Promise<void>;
}

function readSql(...parts: string[]): string {
  return readFileSync(join(ROOT, ...parts), 'utf8');
}

/**
 * A real Postgres with the migrations applied.
 *
 * Real, rather than a mock, because the things worth testing here are
 * row-level security and plpgsql — exactly the parts a mock would not model.
 * The binaries live in node_modules, so this needs neither Docker nor anything
 * installed on the machine.
 */
export async function startHarness(): Promise<Harness> {
  const port = 54000 + Math.floor(process.pid % 900);
  const pg = new EmbeddedPostgres({
    databaseDir: `${DATA_DIR}-${port}`,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
  });

  await pg.initialise();
  await pg.start();
  await pg.createDatabase('rota');
  const client = pg.getPgClient('rota');
  await client.connect();

  await client.query(readSql('testing', 'bootstrap.sql'));

  const migrations = readdirSync(join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of migrations) {
    try {
      await client.query(readSql('migrations', file));
    } catch (error) {
      throw new Error(`${file}: ${(error as Error).message}`);
    }
  }

  await client.query(readSql('testing', 'grants.sql'));

  async function as<T>(userId: string, work: () => Promise<T>, email?: string): Promise<T> {
    await client.query('begin');
    await client.query(`set local role authenticated`);
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    // The full claim set, so auth.jwt() ->> 'email' works the way it does on
    // the hosted platform.
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({
        sub: userId,
        email: email ?? emails.get(userId) ?? `${userId}@test.invalid`,
        role: 'authenticated',
      }),
    ]);
    try {
      const result = await work();
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  async function anon<T>(work: () => Promise<T>): Promise<T> {
    await client.query('begin');
    await client.query(`set local role anon`);
    try {
      const result = await work();
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    }
  }

  const emails = new Map<string, string>();

  async function createUser(email: string): Promise<string> {
    const { rows } = await client.query<{ id: string }>(
      `insert into auth.users (email) values ($1) returning id`,
      [email],
    );
    emails.set(rows[0]!.id, email);
    return rows[0]!.id;
  }

  return {
    client,
    as,
    anon,
    createUser,
    async stop() {
      await client.end();
      await pg.stop();
    },
  };
}

export { migrationNames };

function migrationNames(): string[] {
  return readdirSync(join(ROOT, 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
}
