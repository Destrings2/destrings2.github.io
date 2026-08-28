import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './session';

/**
 * The picking of a household, which is what decides whose home you see.
 *
 * Guarded rather than assumed: the store reads and writes a browser store
 * that is allowed to be absent, and it is on the sign-in path — a throw
 * there would be indistinguishable from being unable to sign in.
 */
describe('switching household', () => {
  const first = { id: 'a', name: 'First', memberId: 'm1' };
  const second = { id: 'b', name: 'Second', memberId: 'm2' };

  beforeEach(() => {
    useSession.setState({ households: [first, second], household: first });
  });

  it('moves to another household you are in', () => {
    useSession.getState().switchHousehold('b');
    expect(useSession.getState().household).toEqual(second);
  });

  it('ignores a household you are not in, rather than blanking the screen', () => {
    useSession.getState().switchHousehold('nope');
    expect(useSession.getState().household).toEqual(first);
  });

  it('remembers the choice for next time', () => {
    const setItem = vi.fn();
    vi.stubGlobal('localStorage', { setItem, getItem: () => null });
    useSession.getState().switchHousehold('b');
    expect(setItem).toHaveBeenCalledWith('rota:household', 'b');
    vi.unstubAllGlobals();
  });

  it('still switches when the browser refuses to store anything', () => {
    vi.stubGlobal('localStorage', {
      setItem() {
        throw new Error('site data blocked');
      },
      getItem() {
        throw new Error('site data blocked');
      },
    });
    expect(() => useSession.getState().switchHousehold('b')).not.toThrow();
    expect(useSession.getState().household).toEqual(second);
    vi.unstubAllGlobals();
  });
});
