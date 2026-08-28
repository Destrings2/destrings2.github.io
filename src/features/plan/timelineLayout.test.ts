import { describe, expect, it } from 'vitest';
import type { PlanEntry } from '@/domain/types';
import { layOutDay, type Cluster, type Block } from './timelineLayout';

const OPTIONS = { pxPerHour: 64, minBlockPx: 26, maxColumns: 2, originMinutes: 7 * 60 };

let n = 0;
const entry = (at: number, mins: number): PlanEntry => ({
  key: `c${n}#${n++}`,
  choreId: `c${n}`,
  personId: 'a',
  day: 0,
  at,
  mins,
  pinned: false,
  skipped: false,
});

describe('layOutDay', () => {
  it('draws well-separated jobs as single blocks in one column', () => {
    const blocks = layOutDay([entry(9 * 60, 30), entry(11 * 60, 45)], OPTIONS);
    expect(blocks).toHaveLength(2);
    for (const block of blocks) {
      expect(block.kind).toBe('single');
      expect((block as Block).columns).toBe(1);
    }
  });

  it('puts two genuinely concurrent jobs side by side', () => {
    const blocks = layOutDay([entry(9 * 60, 60), entry(9 * 60 + 15, 60)], OPTIONS);
    expect(blocks.every((b) => b.kind === 'single')).toBe(true);
    const singles = blocks as Block[];
    expect(singles.map((b) => b.column).sort()).toEqual([0, 1]);
    expect(singles[0]!.columns).toBe(2);
  });

  it('merges a run of back-to-back short jobs rather than slicing it thin', () => {
    // The real case: four jobs inside twenty minutes, each drawn at the 26px
    // minimum so they appear to collide even though they do not overlap.
    const jobs = [
      entry(18 * 60, 6),
      entry(18 * 60 + 6, 5),
      entry(18 * 60 + 12, 4),
      entry(18 * 60 + 16, 4),
    ];
    const blocks = layOutDay(jobs, OPTIONS);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.kind).toBe('cluster');
    const cluster = blocks[0] as Cluster;
    expect(cluster.entries).toHaveLength(4);
    expect(cluster.from).toBe(18 * 60);
    expect(cluster.to).toBe(18 * 60 + 20);
  });

  it('never loses a job', () => {
    const jobs = [
      entry(9 * 60, 10),
      entry(9 * 60 + 5, 10),
      entry(9 * 60 + 8, 10),
      entry(14 * 60, 60),
      entry(19 * 60, 5),
    ];
    const blocks = layOutDay(jobs, OPTIONS);
    const seen = blocks.flatMap((b) => (b.kind === 'cluster' ? b.entries : [b.entry]));
    expect(seen).toHaveLength(jobs.length);
    expect(new Set(seen.map((e) => e.key)).size).toBe(jobs.length);
  });

  it('gives a merged block room for both of its lines', () => {
    const jobs = [entry(18 * 60, 6), entry(18 * 60 + 6, 5), entry(18 * 60 + 12, 4)];
    const blocks = layOutDay(jobs, { ...OPTIONS, minClusterPx: 42 });
    expect(blocks[0]!.kind).toBe('cluster');
    expect(blocks[0]!.height).toBeGreaterThanOrEqual(42);
  });

  it('gives every block a tappable height', () => {
    const blocks = layOutDay([entry(18 * 60, 3), entry(20 * 60, 4)], OPTIONS);
    for (const block of blocks)
      expect(block.height).toBeGreaterThanOrEqual(OPTIONS.minBlockPx - 0.01);
  });

  it('leaves unplaced jobs out — they have no time to draw at', () => {
    const orphan: PlanEntry = { ...entry(0, 10), at: null, personId: null };
    expect(layOutDay([orphan], OPTIONS)).toHaveLength(0);
  });

  it('allows more columns where there is width for them', () => {
    const jobs = [entry(9 * 60, 60), entry(9 * 60 + 10, 60), entry(9 * 60 + 20, 60)];
    const wide = layOutDay(jobs, { ...OPTIONS, maxColumns: 4 });
    expect(wide.every((b) => b.kind === 'single')).toBe(true);
    expect((wide[0] as Block).columns).toBe(3);
  });
});
