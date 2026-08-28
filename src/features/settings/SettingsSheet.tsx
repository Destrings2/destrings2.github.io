import { useState } from 'react';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Range } from '@/components/Field';
import { Overlay } from '@/components/Overlay';
import { formatMins } from '@/domain/time';
import { useHousehold } from '@/store/household';
import { useSession } from '@/store/session';
import { useUi } from '@/store/ui';
import { InviteCard } from './InviteCard';
import { PasswordCard } from './PasswordCard';
import styles from './Settings.module.css';

/**
 * Everything that is not the week: household plumbing, the invite, the
 * password, the scheduler's one knob. Living behind the gear keeps the Split
 * tab about the split.
 */
export function SettingsSheet() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const dailyCap = useHousehold((s) => s.state.settings.dailyCap);
  const { setDailyCap, resetAll, isLocalOnly } = useHousehold();
  const localOnly = isLocalOnly();
  const signOut = useSession((s) => s.signOut);
  const household = useSession((s) => s.household);
  const households = useSession((s) => s.households);
  const switchHousehold = useSession((s) => s.switchHousehold);

  const [confirming, setConfirming] = useState(false);

  return (
    <Overlay
      open={open}
      title="Settings"
      onClose={() => {
        setConfirming(false);
        setOpen(false);
      }}
    >
      <Card title="Scheduling">
        <div className={styles.kv}>
          <span>Most work in any one day</span>
          <span>{formatMins(dailyCap)}</span>
        </div>
        <Range
          min={20}
          max={240}
          step={10}
          value={dailyCap}
          aria-label="Daily cap in minutes"
          onChange={(e) => setDailyCap(Number(e.target.value))}
        />
        <p className={styles.note}>
          Grim jobs — the WC, the bins, the oven, the drains — alternate rather than always landing
          on the same person. Nothing loud is scheduled after 21:00.
        </p>
      </Card>

      {!localOnly && (
        <>
          <InviteCard />
          <PasswordCard />
          <Card title={households.length > 1 ? 'Households' : 'Household'}>
            {households.length > 1 ? (
              <>
                <span className={styles.label}>Showing</span>
                <div className={styles.households}>
                  {households.map((candidate) => (
                    <Button
                      key={candidate.id}
                      size="sm"
                      aria-pressed={candidate.id === household?.id}
                      onClick={() => switchHousehold(candidate.id)}
                    >
                      {candidate.name}
                    </Button>
                  ))}
                </div>
                <p className={styles.note}>
                  You&rsquo;re in more than one. Each has its own home, jobs and running total; this
                  device remembers whichever you pick.
                </p>
              </>
            ) : (
              <>
                <div className={styles.kv}>
                  <span>Signed in to</span>
                  <span>{household?.name ?? '—'}</span>
                </div>
                <p className={styles.note}>Changes sync to everyone in this household.</p>
              </>
            )}
            <div style={{ marginTop: 'var(--s3)' }}>
              <Button size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </Card>
        </>
      )}

      {localOnly && (
        <Card title="Start over">
          <p className={styles.note} style={{ marginTop: 0 }}>
            Wipes every job, person and painted hour on this device.
          </p>
          <div className={styles.actions}>
            <Button
              variant={confirming ? 'danger' : 'default'}
              onClick={() => {
                if (confirming) {
                  void resetAll();
                  setConfirming(false);
                } else setConfirming(true);
              }}
            >
              {confirming ? 'Tap again to wipe' : 'Reset everything'}
            </Button>
            {confirming && <Button onClick={() => setConfirming(false)}>Cancel</Button>}
          </div>
        </Card>
      )}
    </Overlay>
  );
}
