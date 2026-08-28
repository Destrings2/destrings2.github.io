import { useEffect, useMemo } from 'react';
import { Button } from '@/components/Button';
import { Segmented } from '@/components/Segmented';
import type { Floorplan } from '@/data/floorplanTypes';
import type { RoomLoad } from '@/domain/totals';
import type { Person } from '@/domain/types';
import { usePrefersReducedMotion } from '@/hooks/useMediaQuery';
import type { TintMode } from '@/store/types';
import { useUi } from '@/store/ui';
import { CutRod } from './CutRod';
import { roomLabels, roomTints } from './roomVisuals';
import styles from './SceneStage.module.css';
import { useFlatScene } from './useFlatScene';

interface Props {
  plan: Floorplan;
  /** True when the plan is the bundled stand-in rather than this household's. */
  isStarter: boolean;
  /** Set when the real home failed to load, as opposed to not existing. */
  loadError: string | null;
  load: Record<string, RoomLoad>;
  people: Person[];
  tint: TintMode;
  onTintChange(tint: TintMode): void;
  onPickRoom(slug: string): void;
}

const TINTS = [
  { value: 'load', label: 'Load' },
  { value: 'who', label: 'Who' },
  { value: 'plain', label: 'Plain' },
] as const satisfies readonly { value: TintMode; label: string }[];

export function SceneStage({
  plan,
  isStarter,
  loadError,
  load,
  people,
  tint,
  onTintChange,
  onPickRoom,
}: Props) {
  const { sceneMode, showFurniture, cut, openRoom, setSceneMode, toggleFurniture, setCut } =
    useUi();
  const reducedMotion = usePrefersReducedMotion();

  // The cut belongs to whichever home is loaded. Opening at its ceiling, and
  // never above it, means a flat with a lower ceiling than the last one does
  // not start with the rod off the end of its own track.
  useEffect(() => {
    if (cut === null || cut > plan.ceiling) setCut(plan.ceiling);
  }, [plan.ceiling, cut, setCut]);

  const cutHeight = cut === null ? plan.ceiling : Math.min(cut, plan.ceiling);

  const tints = useMemo(
    () => roomTints(plan, load, people, tint, openRoom),
    [plan, load, people, tint, openRoom],
  );
  const labels = useMemo(() => roomLabels(plan, load, people), [plan, load, people]);

  const hostRef = useFlatScene({
    plan,
    cut: cutHeight,
    showFurniture,
    mode: sceneMode,
    tints,
    labels,
    openRoom,
    reducedMotion,
    onPickRoom,
  });

  return (
    <div className={styles.stage}>
      <div ref={hostRef} className={styles.host} />
      <div className={styles.fallback}>
        This device can&rsquo;t draw the 3D model.
        <br />
        Everything else works normally.
      </div>

      {/* Stacked in flow rather than pinned to a corner: the legend already
          owns the top right on a phone, and a banner that overlaps it makes
          both unreadable. */}
      <div className={styles.topLeft}>
        <div className={styles.caption}>
          <h2>
            {plan.name}
            <span>{plan.subtitle}</span>
          </h2>
          <p>
            {plan.floorAreaSqm} m² · ceiling {plan.ceiling.toFixed(2)} m
          </p>
        </div>

        {isStarter && (
          <div className={styles.standIn} role="status">
            <b>{loadError ? 'Couldn’t load your home' : 'Not your home yet'}</b>
            {loadError ?? 'This is the example flat that ships with the app.'}
          </div>
        )}
      </div>

      <div className={styles.tools}>
        <Button
          size="sm"
          onClick={() => {
            const next = sceneMode === '3d' ? 'plan' : '3d';
            setSceneMode(next);
            setCut(next === 'plan' ? 1.3 : plan.ceiling);
          }}
        >
          {sceneMode === '3d' ? 'Plan view' : '3D view'}
        </Button>
        <Segmented
          options={TINTS}
          value={tint}
          onChange={onTintChange}
          label="Room tint"
          className={styles.tintSeg ?? ''}
        />
        <Button size="sm" aria-pressed={showFurniture} onClick={toggleFurniture}>
          Furniture
        </Button>
      </div>

      {tint !== 'plain' && (
        <div className={styles.legend}>
          {tint === 'who' ? (
            <>
              {people.map((person) => (
                <div key={person.id}>
                  {person.name}
                  <i style={{ background: person.colour }} />
                </div>
              ))}
              {/* Not a person: a room with nothing left in it. Under two real
                  names, "clear" on its own read as a third housemate. */}
              <div className={styles.legendNote}>
                nothing left
                <i style={{ background: '#C9CFC9' }} />
              </div>
            </>
          ) : (
            <>
              <div>
                least left
                <i style={{ background: '#CFD3D0' }} />
              </div>
              <div>
                most left
                <i style={{ background: '#E8B93E' }} />
              </div>
            </>
          )}
        </div>
      )}

      <CutRod value={cutHeight} min={0.6} max={plan.ceiling} onChange={setCut} />
    </div>
  );
}
