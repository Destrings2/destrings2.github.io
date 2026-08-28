import { useEffect } from 'react';
import { AppShell } from '@/app/AppShell';
import { useHousehold } from '@/store/household';
import styles from './App.module.css';

export default function App() {
  const status = useHousehold((s) => s.status);
  const hydrate = useHousehold((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  if (status === 'loading') {
    return (
      <div className={styles.boot}>
        <span>the example home</span>
      </div>
    );
  }
  return <AppShell />;
}
