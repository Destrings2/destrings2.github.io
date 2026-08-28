import { Meter } from '@/components/Meter';
import { GearIcon } from './icons';
import { SettingsSheet } from '@/features/settings/SettingsSheet';
import { formatMins, mondayOf } from '@/domain/time';
import { PlanView } from '@/features/plan/PlanView';
import { RoomsView } from '@/features/rooms/RoomsView';
import { SplitView } from '@/features/split/SplitView';
import { ClusterDetail } from '@/features/task/ClusterDetail';
import { TaskDetail } from '@/features/task/TaskDetail';
import { TimeView } from '@/features/time/TimeView';
import { useWeek } from '@/hooks/useWeek';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { SceneStage } from '@/scene/SceneStage';
import { useHousehold } from '@/store/household';
import { useProperty } from '@/store/property';
import { useUi, type Tab } from '@/store/ui';
import styles from './AppShell.module.css';
import { NAV } from './nav';

function weekRange(): string {
  const monday = mondayOf(new Date());
  const sunday = new Date(monday.getTime() + 6 * 864e5);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

/** The tab's own content. The scene is placed by the shell, not by a tab. */
function TabContent({ tab }: { tab: Tab }) {
  switch (tab) {
    case 'plan':
      return <PlanView />;
    case 'rooms':
    case 'home':
      return <RoomsView />;
    case 'time':
      return <TimeView />;
    case 'split':
      return <SplitView />;
  }
}

export function AppShell() {
  const isDesktop = useIsDesktop();
  const state = useHousehold((s) => s.state);
  const setTint = useHousehold((s) => s.setTint);
  const writeFailed = useHousehold((s) => s.writeFailed);
  const loadError = useHousehold((s) => s.loadError);
  const retrySync = useHousehold((s) => s.retrySync);
  const { tab, setTab, openRoomDetail, setSettingsOpen } = useUi();
  const plan = useProperty((s) => s.plan);
  const planSource = useProperty((s) => s.source);
  const planError = useProperty((s) => s.error);
  const week = useWeek();

  const remaining = week.totals.total - week.totals.doneMins;
  const progress = week.totals.total ? week.totals.doneMins / week.totals.total : 0;

  // A failed write matters wherever you are, not just on the tab that had
  // the card. Fixed, so the scene's full-bleed view shows it too.
  const syncChip = loadError ? (
    <span className={styles.syncChip} role="status" title={loadError}>
      Couldn&rsquo;t load this household
    </span>
  ) : writeFailed ? (
    <button className={styles.syncChip} onClick={retrySync}>
      Not saving — tap to retry
    </button>
  ) : null;

  const scene = (
    <SceneStage
      plan={plan}
      isStarter={planSource === 'starter'}
      loadError={planError}
      load={week.load}
      people={state.people}
      tint={state.settings.tint}
      onTintChange={setTint}
      onPickRoom={(slug) => {
        openRoomDetail(slug);
        setTab('rooms');
      }}
    />
  );

  if (isDesktop) {
    const active = NAV.find((n) => n.tab === tab) ?? NAV[0]!;
    return (
      <div className={styles.desktop}>
        <nav className={styles.rail} aria-label="Sections">
          <div className={styles.brand}>
            <h1>
              {plan.name}
              <span>{plan.subtitle}</span>
            </h1>
            <p>
              {weekRange()}
              <br />
              {plan.floorAreaSqm} m² · ceiling {plan.ceiling.toFixed(2)} m
            </p>
          </div>
          {NAV.filter((item) => item.tab !== 'home').map(({ tab: value, label, Icon }) => (
            <button
              key={value}
              className={styles.railItem}
              aria-current={value === tab ? 'page' : undefined}
              onClick={() => setTab(value)}
            >
              <Icon />
              {label}
            </button>
          ))}
          <button
            className={styles.railItem}
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
          >
            <GearIcon />
            Settings
          </button>
          <div className={styles.railFoot}>
            {state.people.map((person, index) => {
              const assigned = week.totals.byPerson[person.id] ?? 0;
              const free = week.week.meta.free[index] ?? 0;
              return (
                <div className={styles.meter} key={person.id}>
                  <Meter
                    name={person.name}
                    nameColour={person.colour}
                    value={formatMins(assigned)}
                    fraction={free ? assigned / free : 0}
                    colour={person.colour}
                  />
                </div>
              );
            })}
          </div>
        </nav>

        <div className={styles.stage}>{scene}</div>

        <section className={styles.panel} aria-label={active.heading}>
          <header className={styles.panelHead}>
            <h2>{active.heading}</h2>
            <p>
              {week.totals.doneCount}/{week.totals.count} done
              <br />
              {formatMins(remaining)} left
            </p>
          </header>
          <div className={styles.panelBody}>
            <TabContent tab={tab} />
          </div>
        </section>

        {syncChip}
        <TaskDetail />
        <ClusterDetail />
        <SettingsSheet />
      </div>
    );
  }

  // ---- compact ---------------------------------------------------------
  const showScene = tab === 'home';
  const active = NAV.find((n) => n.tab === tab) ?? NAV[0]!;

  return (
    <div className={styles.shell}>
      {!showScene && (
        <header className={styles.top}>
          <div className={styles.topRow}>
            <h1>{active.heading}</h1>
            <p>
              {week.totals.doneCount}/{week.totals.count} done
              <br />
              {formatMins(remaining)} left
            </p>
            <button
              className={styles.gear}
              aria-label="Settings"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
            >
              <GearIcon />
            </button>
          </div>
          <div className={styles.progress}>
            <Meter fraction={progress} colour="var(--p2)" />
          </div>
        </header>
      )}

      <main className={`${styles.content} ${showScene ? styles.bleed : ''}`}>
        {showScene ? scene : <div className={styles.stack}>{<TabContent tab={tab} />}</div>}
      </main>

      <nav className={styles.bottom} aria-label="Sections">
        {NAV.map(({ tab: value, label, Icon }) => (
          <button
            key={value}
            className={styles.tab}
            aria-current={value === tab ? 'page' : undefined}
            onClick={() => setTab(value)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>

      {syncChip}
      <TaskDetail />
      <ClusterDetail />
      <SettingsSheet />
    </div>
  );
}
