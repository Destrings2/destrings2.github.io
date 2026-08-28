import type { PlanEntry } from '@/domain/types';

export interface Block {
  kind: 'single';
  entry: PlanEntry;
  top: number;
  height: number;
  column: number;
  columns: number;
}

export interface Cluster {
  kind: 'cluster';
  entries: PlanEntry[];
  top: number;
  height: number;
  from: number;
  to: number;
}

export type TimelineBlock = Block | Cluster;

export interface LayoutOptions {
  pxPerHour: number;
  /** Smallest a block may draw and still be a real tap target. */
  minBlockPx: number;
  /** A merged block carries two lines of text, so it needs a little more. */
  minClusterPx?: number;
  /** Above this many colliding jobs, draw one merged block instead. */
  maxColumns: number;
  originMinutes: number;
}

/**
 * Lay a day's jobs out against a clock.
 *
 * Two things make this awkward. Short jobs have to draw taller than their true
 * duration to stay tappable, which makes back-to-back jobs *appear* to collide
 * even though they don't. And genuinely concurrent jobs have to sit side by
 * side, which on a phone runs out of width after two.
 *
 * So: runs that would need more columns than fit are drawn as a single merged
 * block saying how many jobs are in it. Four five-minute jobs in a row is
 * twenty minutes of pottering, and "4 jobs, 18:00–18:20" describes that better
 * than four slivers with their names cut off.
 */
export function layOutDay(entries: PlanEntry[], options: LayoutOptions): TimelineBlock[] {
  const { pxPerHour, minBlockPx, maxColumns, originMinutes } = options;
  const minMinutes = (minBlockPx / pxPerHour) * 60;
  const toY = (minutes: number) => ((minutes - originMinutes) / 60) * pxPerHour;

  const placed = [...entries].filter((e) => e.at != null).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));

  // Split into runs where each job starts before the previous one finishes
  // drawing. A run is what has to share horizontal space.
  const runs: PlanEntry[][] = [];
  let current: PlanEntry[] = [];
  let runEnd = -Infinity;

  for (const entry of placed) {
    const start = entry.at!;
    const end = start + Math.max(entry.mins, minMinutes);
    if (current.length && start >= runEnd) {
      runs.push(current);
      current = [];
    }
    current.push(entry);
    runEnd = current.length === 1 ? end : Math.max(runEnd, end);
  }
  if (current.length) runs.push(current);

  const blocks: TimelineBlock[] = [];

  for (const run of runs) {
    // How many columns would this run actually need?
    const columnEnds: number[] = [];
    const assigned = run.map((entry) => {
      const start = entry.at!;
      const end = start + Math.max(entry.mins, minMinutes);
      let column = columnEnds.findIndex((e) => e <= start);
      if (column === -1) column = columnEnds.length;
      columnEnds[column] = end;
      return { entry, column, end };
    });
    const columns = columnEnds.length;

    if (columns <= maxColumns) {
      for (const { entry, end } of assigned) {
        const found = assigned.find((a) => a.entry === entry)!;
        blocks.push({
          kind: 'single',
          entry,
          top: toY(entry.at!),
          height: toY(end) - toY(entry.at!),
          column: found.column,
          columns,
        });
      }
      continue;
    }

    const from = Math.min(...run.map((e) => e.at!));
    const to = Math.max(...run.map((e) => e.at! + e.mins));
    const top = toY(from);
    blocks.push({
      kind: 'cluster',
      entries: run,
      top,
      height: Math.max(options.minClusterPx ?? minBlockPx, toY(to) - top),
      from,
      to,
    });
  }

  return blocks;
}
