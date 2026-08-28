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

describe('inviteCodeIn under a base path', () => {
  // GitHub Pages serves a project site from /<repo>/, so every path the app
  // sees is prefixed. Getting this wrong makes every invite link a dead end.
  it('reads a code from a path behind a base', () => {
    expect(inviteCodeIn('https://x.github.io/schedule/join/ABCD2345', '/schedule/')).toBe(
      'ABCD2345',
    );
  });

  it('still works when the base has no trailing slash', () => {
    expect(inviteCodeIn('https://x.github.io/schedule/join/ABCD2345', '/schedule')).toBe(
      'ABCD2345',
    );
  });

  it('reads a code at the root when there is no base', () => {
    expect(inviteCodeIn('https://rota.example/join/ABCD2345', '/')).toBe('ABCD2345');
  });

  it('still reads a code that arrives without the base', () => {
    // Deliberately lenient. A misconfigured base would otherwise turn every
    // invite link into a dead end, and there is nothing to protect here: the
    // code is checked in the database, not by this parser.
    expect(inviteCodeIn('https://x.github.io/join/ABCD2345', '/schedule/')).toBe('ABCD2345');
  });

  it('finds a query code regardless of the base', () => {
    expect(inviteCodeIn('https://x.github.io/schedule/?join=ABCD2345', '/schedule/')).toBe(
      'ABCD2345',
    );
  });
});
