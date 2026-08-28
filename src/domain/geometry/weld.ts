import type { LevelDocument, NodeRecord } from './schema';

export interface WeldPlan {
  /** Groups of corners that would become one, each with its new position. */
  merges: { keep: string; absorb: string[]; x: number; y: number }[];
  /** Walls that would collapse to nothing once their ends are joined. */
  collapsing: string[];
  nodesBefore: number;
  nodesAfter: number;
}

/**
 * Work out which corners would join at a given tolerance, without changing
 * anything.
 *
 * The preview matters here. A flat drawn as overlapping thick slabs can look
 * entirely correct and still have no two walls sharing a corner, and how many
 * join depends entirely on how far you are willing to move them. Welding is
 * therefore something a person chooses to do to a specific corner while looking
 * at the result, not something an importer does on their behalf.
 */
export function planWeld(level: LevelDocument, tolerance: number): WeldPlan {
  const nodes = level.nodes;
  const taken = new Array<boolean>(nodes.length).fill(false);
  const merges: WeldPlan['merges'] = [];
  const mergedInto = new Map<string, string>();

  for (let i = 0; i < nodes.length; i++) {
    if (taken[i]) continue;
    const anchor = nodes[i]!;
    taken[i] = true;
    const cluster: NodeRecord[] = [anchor];

    for (let j = i + 1; j < nodes.length; j++) {
      if (taken[j]) continue;
      const other = nodes[j]!;
      if (Math.hypot(anchor.x - other.x, anchor.y - other.y) <= tolerance) {
        taken[j] = true;
        cluster.push(other);
      }
    }

    if (cluster.length === 1) continue;

    // The joined corner sits at the average of what went into it.
    const x = cluster.reduce((s, n) => s + n.x, 0) / cluster.length;
    const y = cluster.reduce((s, n) => s + n.y, 0) / cluster.length;
    const absorb = cluster.slice(1).map((n) => n.id);
    merges.push({ keep: anchor.id, absorb, x, y });
    for (const id of absorb) mergedInto.set(id, anchor.id);
  }

  const resolve = (id: string) => mergedInto.get(id) ?? id;
  const collapsing = level.walls
    .filter((wall) => resolve(wall.from) === resolve(wall.to))
    .map((wall) => wall.id);

  const absorbed = merges.reduce((sum, m) => sum + m.absorb.length, 0);
  return {
    merges,
    collapsing,
    nodesBefore: nodes.length,
    nodesAfter: nodes.length - absorbed,
  };
}

/**
 * Apply a weld. Walls whose two ends became the same corner are dropped —
 * they have no length left to draw.
 */
export function applyWeld(level: LevelDocument, plan: WeldPlan): LevelDocument {
  const moveTo = new Map<string, { id: string; x: number; y: number }>();
  for (const merge of plan.merges) {
    for (const id of merge.absorb) moveTo.set(id, { id: merge.keep, x: merge.x, y: merge.y });
    moveTo.set(merge.keep, { id: merge.keep, x: merge.x, y: merge.y });
  }

  const nodes = level.nodes
    .filter((node) => (moveTo.get(node.id)?.id ?? node.id) === node.id)
    .map((node) => {
      const moved = moveTo.get(node.id);
      return moved ? { ...node, x: moved.x, y: moved.y } : node;
    });

  const resolve = (id: string) => moveTo.get(id)?.id ?? id;
  const walls = level.walls
    .map((wall) => ({ ...wall, from: resolve(wall.from), to: resolve(wall.to) }))
    .filter((wall) => wall.from !== wall.to);

  return { ...level, nodes, walls };
}
