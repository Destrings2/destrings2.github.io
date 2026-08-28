import { describe, expect, it } from 'vitest';
import { inviteCodeIn } from './supabase';

const at = (path: string) => `https://rota.example${path}`;

describe('inviteCodeIn', () => {
  it('reads a code out of the path', () => {
    expect(inviteCodeIn(at('/join/ABCD2345'))).toBe('ABCD2345');
    expect(inviteCodeIn(at('/join/ABCD2345/'))).toBe('ABCD2345');
  });

  it('reads a code out of the query, for clients that mangle paths', () => {
    expect(inviteCodeIn(at('/?join=ABCD2345'))).toBe('ABCD2345');
  });

  it('upper-cases what it finds, since the codes are upper-case', () => {
    expect(inviteCodeIn(at('/join/abcd2345'))).toBe('ABCD2345');
  });

  it('finds nothing on an ordinary page', () => {
    expect(inviteCodeIn(at('/'))).toBeNull();
    expect(inviteCodeIn(at('/plan'))).toBeNull();
  });

  it('ignores anything that is not shaped like a code', () => {
    expect(inviteCodeIn(at('/join/short'))).toBeNull();
    expect(inviteCodeIn(at('/join/waytoolongtobeacode'))).toBeNull();
    expect(inviteCodeIn(at('/?join=<script>'))).toBeNull();
    expect(inviteCodeIn(at('/join/../../etc'))).toBeNull();
  });

  it('does not throw on something that is not a URL at all', () => {
    expect(inviteCodeIn('not a url')).toBeNull();
    expect(inviteCodeIn('')).toBeNull();
  });
});
