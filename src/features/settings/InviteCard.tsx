import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useSession } from '@/store/session';
import styles from './Settings.module.css';

/**
 * How the second person gets in.
 *
 * A link rather than a code to read out: it carries the code in the path, so
 * opening it on their phone puts them straight into the join screen with the
 * field already filled. The same unclaimed link is handed back each time, so
 * one already sent by text keeps working.
 */
export function InviteCard() {
  const inviteLink = useSession((s) => s.inviteLink);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function reveal() {
    setBusy(true);
    setLink(await inviteLink());
    setBusy(false);
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is on screen to copy by hand anyway.
    }
  }

  return (
    <Card title="Invite someone">
      {link ? (
        <>
          <p className={styles.note} style={{ marginTop: 0 }}>
            Send them this. It works once, and expires in a week.
          </p>
          <p
            className={styles.note}
            style={{
              userSelect: 'all',
              wordBreak: 'break-all',
              color: 'var(--text)',
              background: 'var(--surface-2)',
              padding: 'var(--s3)',
              borderRadius: 'var(--r-sm)',
              marginTop: 'var(--s2)',
            }}
          >
            {link}
          </p>
          <div style={{ marginTop: 'var(--s3)' }}>
            <Button size="sm" onClick={() => void copy()}>
              {copied ? 'Copied ✓' : 'Copy link'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.note} style={{ marginTop: 0 }}>
            The other person needs a link from you — nobody can sign themselves up.
          </p>
          <div style={{ marginTop: 'var(--s3)' }}>
            <Button size="sm" disabled={busy} onClick={() => void reveal()}>
              {busy ? 'Making a link…' : 'Get an invite link'}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
