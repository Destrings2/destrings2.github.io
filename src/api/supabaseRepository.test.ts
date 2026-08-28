import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { blankState } from '@/store/household';
import { supabaseRepository } from './supabaseRepository';

/**
 * A client that answers the way supabase-js does: a failed write is a
 * returned error, never a thrown one. Everything chains, and every chain
 * settles to the same answer.
 */
function stubClient(answer: { error: { message: string; code?: string } | null }) {
  const calls: string[] = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['update', 'upsert', 'insert', 'delete', 'eq', 'is', 'in', 'select']) {
    chain[method] = (...args: unknown[]) => {
      calls.push(`${method}(${args.length})`);
      return chain;
    };
  }
  // Awaiting any point in the chain settles to the answer.
  chain['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve);

  const client = {
    from(table: string) {
      calls.push(`from(${table})`);
      return chain;
    },
    rpc(name: string) {
      calls.push(`rpc(${name})`);
      return Promise.resolve(answer);
    },
  } as unknown as SupabaseClient;

  return { client, calls };
}

const state = blankState();
const person = state.people[0]!.id;

describe('a write the database refuses', () => {
  it('fails rather than reporting success — the free-time grid case', async () => {
    // set_availability is the one that bit: the grid was painted, the write
    // was refused, the outbox was told it had landed, and the next read put
    // the old grid back. Nothing said anything.
    const { client, calls } = stubClient({
      error: { message: 'permission denied for function set_availability', code: '42501' },
    });
    const repo = supabaseRepository(client, 'household-1');

    await expect(repo.commit(state, { kind: 'availability', personId: person })).rejects.toThrow(
      /permission denied/,
    );
    expect(calls).toContain('rpc(set_availability)');
  });

  it('fails for the settings write too', async () => {
    const { client } = stubClient({ error: { message: 'row-level security', code: '42501' } });
    const repo = supabaseRepository(client, 'household-1');
    await expect(repo.commit(state, { kind: 'settings' })).rejects.toThrow(/row-level security/);
  });

  it('fails for a member write, so a colour cannot be lost quietly', async () => {
    const { client } = stubClient({ error: { message: 'nope' } });
    const repo = supabaseRepository(client, 'household-1');
    await expect(repo.commit(state, { kind: 'members' })).rejects.toThrow(/nope/);
  });

  it('says something useful when the error carries no message', async () => {
    const { client } = stubClient({ error: { message: '', code: '23505' } });
    const repo = supabaseRepository(client, 'household-1');
    await expect(repo.commit(state, { kind: 'availability', personId: person })).rejects.toThrow(
      /23505/,
    );
  });
});

describe('a write the database accepts', () => {
  it('resolves, so the outbox may forget it', async () => {
    const { client, calls } = stubClient({ error: null });
    const repo = supabaseRepository(client, 'household-1');

    await expect(
      repo.commit(state, { kind: 'availability', personId: person }),
    ).resolves.toBeUndefined();
    await expect(repo.commit(state, { kind: 'settings' })).resolves.toBeUndefined();
    expect(calls).toContain('from(households)');
  });
});
