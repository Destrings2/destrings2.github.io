/**
 * The accent colours a person can pick.
 *
 * Colour is how this app says *who*: the stripe down a task, a timeline lane,
 * a meter, the floor tint in "who" mode. So the set is chosen rather than
 * assembled — every colour clears 4.5:1 against the dark ground and reads with
 * near-black text on top of it, and no two are close enough to be confused.
 * `palette.test.ts` holds both of those down.
 *
 * Ordered so the first few picks are far apart: a two-person household taking
 * the defaults gets amber and teal, which nothing could mistake for each other.
 */
export interface Accent {
  id: string;
  name: string;
  hex: string;
}

export const ACCENTS: readonly Accent[] = [
  { id: 'amber', name: 'Amber', hex: '#E8B93E' },
  { id: 'teal', name: 'Teal', hex: '#5FA394' },
  { id: 'violet', name: 'Violet', hex: '#B47CC7' },
  { id: 'coral', name: 'Coral', hex: '#E08A63' },
  { id: 'sky', name: 'Sky', hex: '#6FA8DC' },
  { id: 'rose', name: 'Rose', hex: '#DE7FA1' },
  { id: 'lime', name: 'Lime', hex: '#A8C169' },
  { id: 'sand', name: 'Sand', hex: '#C9A57F' },
];

/** The ground colours sit on: --ink. */
export const GROUND = '#14171A';

export const DEFAULT_ACCENTS: readonly string[] = ACCENTS.map((a) => a.hex);

export function accentFor(hex: string): Accent | undefined {
  const wanted = hex.toUpperCase();
  return ACCENTS.find((a) => a.hex.toUpperCase() === wanted);
}

/** The first accent nobody else is using, so a new member never clashes. */
export function nextFreeAccent(taken: readonly string[]): string {
  const used = new Set(taken.map((c) => c.toUpperCase()));
  return (ACCENTS.find((a) => !used.has(a.hex.toUpperCase())) ?? ACCENTS[0]!).hex;
}

// ---- colour maths, used by the tests and by nothing else -----------------

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const linearise = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linearise) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

function toLab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linearise) as [number, number, number];
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Roughly how different two colours look. Below about 20 is a squint. */
export function perceptualDistance(a: string, b: string): number {
  const [l1, a1, b1] = toLab(a);
  const [l2, a2, b2] = toLab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
