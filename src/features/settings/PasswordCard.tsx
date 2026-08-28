import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field, TextInput } from '@/components/Field';
import { useSession } from '@/store/session';
import styles from './Settings.module.css';

/**
 * A way out of the email loop.
 *
 * Supabase's built-in mailer allows only a handful of messages an hour, so an
 * app that can only be entered by magic link locks you out of your own account
 * on the fourth attempt. Setting a password from a session you already have
 * sends nothing at all — and the invite is what gates access here anyway, not
 * proof that you own the address.
 */
export function PasswordCard() {
  const setPassword = useSession((s) => s.setPassword);
  const busy = useSession((s) => s.busy);
  const hasPassword = useSession((s) => s.session?.user.user_metadata?.['has_password'] === true);
  const [value, setValue] = useState('');
  const [done, setDone] = useState(false);

  const tooShort = value.length > 0 && value.length < 8;

  return (
    <Card title="Password" aside={hasPassword ? 'set' : undefined}>
      {done ? (
        <p className={styles.note} style={{ marginTop: 0 }}>
          Set. You can now sign in with your email and this password, without waiting for a link.
        </p>
      ) : (
        <>
          <p className={styles.note} style={{ marginTop: 0, marginBottom: 'var(--s3)' }}>
            {hasPassword
              ? 'You have one. Typing a new password here replaces it.'
              : 'Optional. Setting one lets you sign in on a new device without waiting for an emailed link, which is worth having — the built-in mailer only allows a few an hour.'}
          </p>
          <Field label="New password">
            {(id) => (
              <TextInput
                id={id}
                type="password"
                autoComplete="new-password"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            )}
          </Field>
          {tooShort && (
            <p className={styles.note} style={{ color: 'var(--alert)' }}>
              At least 8 characters.
            </p>
          )}
          <div style={{ marginTop: 'var(--s3)' }}>
            <Button
              size="sm"
              disabled={busy || value.length < 8}
              onClick={() => {
                void setPassword(value).then((ok) => {
                  if (ok) {
                    setDone(true);
                    setValue('');
                  }
                });
              }}
            >
              {busy ? 'Saving…' : hasPassword ? 'Change password' : 'Set password'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
