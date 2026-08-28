import { useEffect, useRef } from 'react';
import { Card } from '@/components/Card';
import { H0, DAYS, dayIndexOf, formatMins, hhmm, mondayOf } from '@/domain/time';
import { useHousehold } from '@/store/household';
import { choreById } from '@/store/selectors';
import { useUi } from '@/store/ui';
import type { useWeek } from '@/hooks/useWeek';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import styles from './DayTimeline.module.css';
import { layOutDay } from './timelineLayout';

type Week = ReturnType<typeof useWeek>;

/** Visible span and scale of the timeline. */
const T0 = 7 * 60;
const T1 = 23 * 60;
const PX_PER_HOUR = 64;
const MIN_BLOCK = 26;
const MIN_CLUSTER = 42;
/** Below this the block gets the clock only; there is no room for a name. */
const NARROW_PX = 108;

const toY = (minutes: number) => ((minutes - T0) / 60) * PX_PER_HOUR;

export function DayTimeline({ week }: { week: Week }) {
  const state = useHousehold((s) => s.state);
  const { dayCursor, setDayCursor, setTaskSheet, setClusterSheet } = useUi();
  const bodyRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();
  const today = dayIndexOf(new Date());
  const monday = mondayOf(new Date());

  const unplaced = week.week.plan.filter((e) => !e.skipped && !e.personId && e.day === dayCursor);

  // How many jobs can sit side by side before a name stops being readable.
  const laneWidthPx = (isDesktop ? 420 : 340) / state.people.length;
  const maxColumns = Math.max(1, Math.floor(laneWidthPx / NARROW_PX));

  const lanes = state.people.map((person) => {
    const grid = state.availability[person.id] ?? [];
    const free = (grid[dayCursor] ?? [])
      .map((on, i) => (on ? ([(H0 + i) * 60, (H0 + i + 1) * 60] as const) : null))
      .filter((v): v is readonly [number, number] => v !== null);
    const items = week.week.plan.filter(
      (e) => e.personId === person.id && e.day === dayCursor && e.at != null && !e.skipped,
    );
    const blocks = layOutDay(items, {
      pxPerHour: PX_PER_HOUR,
      minBlockPx: MIN_BLOCK,
      minClusterPx: MIN_CLUSTER,
      maxColumns,
      originMinutes: T0,
    });
    return { person, free, blocks };
  });

  // Open on the current time if we're looking at today, else the first job.
  // Scrolls the timeline's own box, never the page.
  useEffect(() => {
    const scroller = bodyRef.current;
    if (!scroller) return;
    const marker =
      scroller.querySelector<HTMLElement>(`.${styles.now}`) ??
      scroller.querySelector<HTMLElement>(`.${styles.item}, .${styles.cluster}`);
    if (!marker) return;
    const wanted = marker.offsetTop - scroller.clientHeight / 2 + marker.offsetHeight / 2;
    scroller.scrollTop = Math.max(0, wanted);
  }, [dayCursor]);

  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const hours: number[] = [];
  for (let m = T0; m < T1; m += 60) hours.push(m);

  return (
    <>
      <div className={styles.picker}>
        {DAYS.map((name, index) => {
          const date = new Date(monday.getTime() + index * 864e5);
          return (
            <button
              key={name}
              className={`${styles.pick} ${index === today ? styles.isToday : ''}`}
              aria-pressed={index === dayCursor}
              onClick={() => setDayCursor(index)}
            >
              {name.slice(0, 2)}
              <b>{date.getDate()}</b>
            </button>
          );
        })}
      </div>

      {unplaced.length > 0 && (
        <Card accent title="Didn't fit today">
          {unplaced.map((entry) => (
            <button key={entry.key} className={styles.item} onClick={() => setTaskSheet(entry.key)}>
              {choreById(state, entry.choreId)?.name} · {formatMins(entry.mins)}
            </button>
          ))}
        </Card>
      )}

      <div className={styles.tl}>
        <div className={styles.head} style={{ ['--lanes' as string]: lanes.length }}>
          <span />
          {lanes.map(({ person }) => (
            <span key={person.id} style={{ color: person.colour }}>
              {person.name}
            </span>
          ))}
        </div>
        <div ref={bodyRef} className={styles.scroller}>
          <div className={styles.body} style={{ height: `${((T1 - T0) / 60) * PX_PER_HOUR}px` }}>
            <div className={styles.axis}>
              {hours.map((m) => (
                <span key={m} style={{ top: `${toY(m)}px` }}>
                  {Math.floor(m / 60)}
                </span>
              ))}
            </div>
            {hours.map((m) => (
              <i key={m} className={styles.line} style={{ top: `${toY(m)}px` }} />
            ))}

            {lanes.map(({ person, free, blocks }, laneIndex) => (
              <div
                key={person.id}
                className={styles.lane}
                style={{
                  left: `${(laneIndex * 100) / lanes.length}%`,
                  width: `${100 / lanes.length}%`,
                }}
              >
                {free.map(([from, to]) => (
                  <i
                    key={from}
                    className={styles.free}
                    style={{
                      top: `${toY(from)}px`,
                      height: `${((to - from) / 60) * PX_PER_HOUR}px`,
                      background: person.colour,
                    }}
                  />
                ))}
                {blocks.map((block) => {
                  if (block.kind === 'cluster') {
                    return (
                      <button
                        key={block.entries[0]!.key}
                        className={styles.cluster}
                        style={{
                          top: `${block.top}px`,
                          height: `${block.height - 2}px`,
                          borderColor: person.colour,
                        }}
                        onClick={() => setClusterSheet(block.entries.map((e) => e.key))}
                      >
                        <b>
                          {hhmm(block.from)}–{hhmm(block.to)}
                        </b>
                        {block.entries.length} quick jobs
                      </button>
                    );
                  }
                  const { entry, column, columns } = block;
                  const chore = choreById(state, entry.choreId);
                  const width = 100 / columns;
                  const narrow = laneWidthPx / columns < NARROW_PX;
                  return (
                    <button
                      key={entry.key}
                      className={[
                        styles.item,
                        week.done.has(entry.key) ? styles.done : '',
                        narrow ? styles.narrow : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        top: `${block.top}px`,
                        height: `${block.height - 2}px`,
                        left: `calc(${column * width}% + 2px)`,
                        width: `calc(${width}% - 5px)`,
                        borderColor: person.colour,
                      }}
                      title={chore?.name}
                      onClick={() => setTaskSheet(entry.key)}
                    >
                      <b>{hhmm(entry.at ?? 0)}</b>
                      {chore?.name}
                    </button>
                  );
                })}
              </div>
            ))}

            {dayCursor === today && nowMinutes >= T0 && nowMinutes <= T1 && (
              <i className={styles.now} style={{ top: `${toY(nowMinutes)}px` }} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
