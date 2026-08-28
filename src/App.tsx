import { useEffect } from 'react';
import { APP_NAME } from '@/appName';
import { AppShell } from '@/app/AppShell';
import { supabase } from '@/api/supabase';
import { supabaseRepository } from '@/api/supabaseRepository';
import { AuthGate } from '@/features/auth/AuthGate';
import { useHousehold } from '@/store/household';
import { useProperty } from '@/store/property';
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
  const loadProperty = useProperty((s) => s.load);
  const showStarterPlan = useProperty((s) => s.useStarter);

  useEffect(() => {
    if (stage === 'local') {
      void hydrate(indexedDbRepository);
      // No backend, so no real geometry to fetch: the generic flat it is.
      showStarterPlan();
    } else if (stage === 'ready' && householdId) {
      void hydrate(supabaseRepository(supabase(), householdId));
      void loadProperty(supabase(), householdId);
    }
    return () => detach();
  }, [stage, householdId, hydrate, detach, loadProperty, showStarterPlan]);

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
        <span>{APP_NAME}</span>
      </div>
    );
  }
  return <AppShell />;
}
