import { useEffect } from 'react';
import { AppShell } from '@/app/AppShell';
import { supabase } from '@/api/supabase';
import { supabaseRepository } from '@/api/supabaseRepository';
import { AuthGate } from '@/features/auth/AuthGate';
import { useHousehold } from '@/store/household';
import { indexedDbRepository } from '@/store/repository';
import { useSession } from '@/store/session';
import styles from './App.module.css';

export default function App() {
  return (
    <AuthGate>
      <Household />
    </AuthGate>
  );
}

/**
 * Points the store at whichever backing store this session has: Postgres once
 * there is a household to read, IndexedDB otherwise. The rest of the app is
 * written against neither.
 */
function Household() {
  const stage = useSession((s) => s.stage);
  const householdId = useSession((s) => s.household?.id ?? null);
  const status = useHousehold((s) => s.status);
  const hydrate = useHousehold((s) => s.hydrate);
  const detach = useHousehold((s) => s.detach);
  const flushWrites = useHousehold((s) => s.flushWrites);

  useEffect(() => {
    if (stage === 'local') {
      void hydrate(indexedDbRepository);
    } else if (stage === 'ready' && householdId) {
      void hydrate(supabaseRepository(supabase(), householdId));
    }
    return () => detach();
  }, [stage, householdId, hydrate, detach]);

  // Signal comes back, or the phone is put away mid-edit: send what is queued
  // rather than waiting out a debounce that may never finish.
  useEffect(() => {
    const flush = () => flushWrites();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flushWrites();
    };
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('online', flush);
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
    };
  }, [flushWrites]);

  if (status === 'loading') {
    return (
      <div className={styles.boot}>
        <span>the example home</span>
      </div>
    );
  }
  return <AppShell />;
}
