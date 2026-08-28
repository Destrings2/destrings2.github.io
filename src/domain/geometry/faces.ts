import type { LevelDocument } from './schema';

export interface Face {
  /** Corner ids, anticlockwise, first not repeated at the end. */
  nodes: string[];
  points: [number, number][];
  areaSqm: number;
}

/**
 * Find the enclosed spaces in a wall graph.
 *
 * Asking somebody to hand-author the polygon for an L-shaped landing is not a
 * product, so the editor derives room outlines from the walls they drew and
 * lets them correct the result. This is the derivation: a standard planar face
 * traversal — at each corner sort the walls by angle, then always leave along
 * the next one clockwise from the way you came in, which walks the boundary of
 * one face and no other.
 *
 * It finds nothing in a flat drawn as overlapping slabs, and that is the honest
 * answer: no two walls share a corner, so there is no connected graph to walk.
 * Weld the corners first and the rooms appear.
 */
export function findFaces(level: LevelDocument): Face[] {
  const nodes = new Map(level.nodes.map((n) => [n.id, n]));

  // Directed half-edges, so each wall can be walked from either end.
  interface HalfEdge {
    from: string;
    to: string;
    angle: number;
  }
  const outgoing = new Map<string, HalfEdge[]>();
  const key = (e: { from: string; to: string }) => `${e.from}>${e.to}`;

  for (const wall of level.walls) {
    const a = nodes.get(wall.from);
    const b = nodes.get(wall.to);
    if (!a || !b || a.id === b.id) continue;
    const forward = { from: a.id, to: b.id, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    const back = { from: b.id, to: a.id, angle: Math.atan2(a.y - b.y, a.x - b.x) };
    (outgoing.get(a.id) ?? outgoing.set(a.id, []).get(a.id)!).push(forward);
    (outgoing.get(b.id) ?? outgoing.set(b.id, []).get(b.id)!).push(back);
  }
  for (const list of outgoing.values()) list.sort((p, q) => p.angle - q.angle);

  /** Coming in along `edge`, the next edge clockwise around its far corner. */
  function nextEdge(edge: HalfEdge): HalfEdge | null {
    const around = outgoing.get(edge.to);
    if (!around || around.length === 0) return null;
    const incoming = Math.atan2(
      nodes.get(edge.from)!.y - nodes.get(edge.to)!.y,
      nodes.get(edge.from)!.x - nodes.get(edge.to)!.x,
    );
    // The neighbour just before the way we came in, wrapping round.
    let best: HalfEdge | null = null;
    let bestGap = Infinity;
    for (const candidate of around) {
      let gap = incoming - candidate.angle;
      while (gap <= 0) gap += Math.PI * 2;
      if (gap < bestGap) {
        bestGap = gap;
        best = candidate;
      }
    }
    return best;
  }

  const visited = new Set<string>();
  const faces: Face[] = [];

  for (const list of outgoing.values()) {
    for (const start of list) {
      if (visited.has(key(start))) continue;

      const walk: HalfEdge[] = [];
      let edge: HalfEdge | null = start;
      // A face cannot be longer than every half-edge in the graph.
      const limit = level.walls.length * 2 + 1;

      while (edge && !visited.has(key(edge)) && walk.length <= limit) {
        visited.add(key(edge));
        walk.push(edge);
        edge = nextEdge(edge);
        if (edge && key(edge) === key(start)) break;
      }
      if (walk.length < 3) continue;

      const points = walk.map((e) => {
        const node = nodes.get(e.from)!;
        return [node.x, node.y] as [number, number];
      });
      const signed = signedArea(points);
      // The traversal yields every face plus the outside of the whole graph,
      // which is the one wound the other way.
      if (signed <= 0) continue;
      if (signed < 0.05) continue;

      faces.push({ nodes: walk.map((e) => e.from), points, areaSqm: signed });
    }
  }

  return faces.sort((a, b) => b.areaSqm - a.areaSqm);
}

export function signedArea(points: readonly [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}
