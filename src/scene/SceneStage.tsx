import { useEffect, useMemo } from 'react';
import { Button } from '@/components/Button';
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
  load: Record<string, RoomLoad>;
  people: Person[];
  tint: TintMode;
  onTintChange(tint: TintMode): void;
  onPickRoom(slug: string): void;
}

const TINT_LABEL: Record<TintMode, string> = { load: 'Load', who: 'Who', plain: 'Plain' };
const NEXT_TINT: Record<TintMode, TintMode> = { load: 'who', who: 'plain', plain: 'load' };

export function SceneStage({ plan, load, people, tint, onTintChange, onPickRoom }: Props) {
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

      <div className={styles.caption}>
        <h2>
          {plan.name}
          <span>{plan.subtitle}</span>
        </h2>
        <p>
          {plan.floorAreaSqm} m² · ceiling {plan.ceiling.toFixed(2)} m
        </p>
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
        <Button size="sm" onClick={() => onTintChange(NEXT_TINT[tint])}>
          Tint · {TINT_LABEL[tint]}
        </Button>
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
              <div>
                clear
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
