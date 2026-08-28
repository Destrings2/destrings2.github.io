import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field, TextInput } from '@/components/Field';
import { useSession } from '@/store/session';
import styles from './AuthGate.module.css';

/**
 * Stands between the app and whoever is using it — but only when there is a
 * backend to stand in front of. With no project configured the app runs
 * on-device and this never appears.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { stage, start } = useSession();

  useEffect(() => {
    void start();
  }, [start]);

  if (stage === 'local' || stage === 'ready') return <>{children}</>;
  if (stage === 'loading') return <Splash />;
  if (stage === 'signedOut') return <SignIn />;
  return <ChooseHousehold />;
}

function Splash() {
  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        <h1>
          the example home
          <span>house &amp; chores</span>
        </h1>
      </div>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.screen}>
      <div className={styles.brand}>
        <h1>
          the example home
          <span>house &amp; chores</span>
        </h1>
        <p>
          A week of housework split so you each give up the same share of your own free time — not
          the same number of hours.
        </p>
      </div>
      {children}
    </div>
  );
}

function SignIn() {
  const { sendMagicLink, busy, error, linkSentTo, pendingInvite, dismissError } = useSession();
  const [email, setEmail] = useState('');

  if (linkSentTo) {
    return (
      <Shell>
        <p className={`${styles.error} ${styles.sent}`}>
          Check <b>{linkSentTo}</b> for a link to sign in. It works on whichever device you open it
          on.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <Card title="Sign in">
        <div className={styles.form}>
          {error && <p className={styles.error}>{error}</p>}
          <Field label="Email">
            {(id) => (
              <TextInput
                id={id}
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (error) dismissError();
                }}
                onKeyDown={(e) => e.key === 'Enter' && email.includes('@') && sendMagicLink(email)}
              />
            )}
          </Field>
          <Button
            variant="primary"
            full
            disabled={busy || !email.includes('@')}
            onClick={() => sendMagicLink(email)}
          >
            {busy ? 'Sending…' : 'Email me a link'}
          </Button>
          <p className={styles.note}>
            No password. We send a link; opening it signs you in.
            {pendingInvite && (
              <>
                {' '}
                You&rsquo;ll join the household invited by <b>{pendingInvite}</b> once you&rsquo;re
                in.
              </>
            )}
          </p>
        </div>
      </Card>
    </Shell>
  );
}

function ChooseHousehold() {
  const { createHousehold, joinHousehold, busy, error, pendingInvite, signOut, dismissError } =
    useSession();
  const [mode, setMode] = useState<'create' | 'join'>(pendingInvite ? 'join' : 'create');
  const [displayName, setDisplayName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [code, setCode] = useState(pendingInvite ?? '');
  const [founderCode, setFounderCode] = useState('');

  const canCreate = displayName.trim() && householdName.trim() && founderCode.trim().length >= 6;
  const canJoin = displayName.trim() && code.trim().length >= 6;

  return (
    <Shell>
      {error && <p className={styles.error}>{error}</p>}

      {mode === 'create' ? (
        <Card title="Start a household">
          <div className={styles.form}>
            <Field label="Your name">
              {(id) => (
                <TextInput
                  id={id}
                  value={displayName}
                  placeholder="Alex"
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (error) dismissError();
                  }}
                />
              )}
            </Field>
            <Field label="What to call the place">
              {(id) => (
                <TextInput
                  id={id}
                  value={householdName}
                  placeholder="the example home"
                  onChange={(e) => setHouseholdName(e.target.value)}
                />
              )}
            </Field>
            <Field label="Founder code">
              {(id) => (
                <TextInput
                  id={id}
                  value={founderCode}
                  placeholder="ABCD234567"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => setFounderCode(e.target.value.toUpperCase())}
                />
              )}
            </Field>
            <Button
              variant="primary"
              full
              disabled={busy || !canCreate}
              onClick={() => createHousehold(householdName, displayName, founderCode)}
            >
              {busy ? 'Setting up…' : 'Start'}
            </Button>
            <p className={styles.note}>
              Starting a household needs a code from whoever runs this. If you were sent a link to
              join someone else&rsquo;s, use that instead. You&rsquo;ll get the the example home
              floorplan and a starter list of 72 jobs to edit down to your own place.
            </p>
          </div>
        </Card>
      ) : (
        <Card title="Join a household">
          <div className={styles.form}>
            <Field label="Your name">
              {(id) => (
                <TextInput
                  id={id}
                  value={displayName}
                  placeholder="Sam"
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    if (error) dismissError();
                  }}
                />
              )}
            </Field>
            <Field label="Invite code">
              {(id) => (
                <TextInput
                  id={id}
                  value={code}
                  placeholder="ABCD2345"
                  autoCapitalize="characters"
                  spellCheck={false}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                />
              )}
            </Field>
            <Button
              variant="primary"
              full
              disabled={busy || !canJoin}
              onClick={() => joinHousehold(code, displayName)}
            >
              {busy ? 'Joining…' : 'Join'}
            </Button>
          </div>
        </Card>
      )}

      <div className={styles.switch}>
        {mode === 'create' ? (
          <button className={styles.link} onClick={() => setMode('join')}>
            I have an invite code
          </button>
        ) : (
          <button className={styles.link} onClick={() => setMode('create')}>
            Start a new household instead
          </button>
        )}
        <span>·</span>
        <button className={styles.link} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </Shell>
  );
}
