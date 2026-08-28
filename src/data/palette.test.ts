import { describe, expect, it } from 'vitest';
import {
  ACCENTS,
  GROUND,
  accentFor,
  contrastRatio,
  nextFreeAccent,
  perceptualDistance,
} from './palette';

describe('the accent palette', () => {
  it('has unique ids and colours', () => {
    expect(new Set(ACCENTS.map((a) => a.id)).size).toBe(ACCENTS.length);
    expect(new Set(ACCENTS.map((a) => a.hex.toUpperCase())).size).toBe(ACCENTS.length);
  });

  it('is legible as text and as a stripe on the dark ground', () => {
    for (const accent of ACCENTS) {
      expect(contrastRatio(accent.hex, GROUND), accent.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('takes near-black text on top, for pressed buttons and meters', () => {
    for (const accent of ACCENTS) {
      expect(contrastRatio('#14171A', accent.hex), accent.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps every pair far enough apart to tell two people apart', () => {
    for (let i = 0; i < ACCENTS.length; i++) {
      for (let j = i + 1; j < ACCENTS.length; j++) {
        const a = ACCENTS[i]!;
        const b = ACCENTS[j]!;
        expect(perceptualDistance(a.hex, b.hex), `${a.name} vs ${b.name}`).toBeGreaterThan(20);
      }
    }
  });

  it('differs in lightness too, not only in hue', () => {
    // Colour alone should not be the only signal — a screenshot in greyscale,
    // or a viewer who cannot separate two hues, still has something to go on.
    for (let i = 0; i < ACCENTS.length; i++) {
      for (let j = i + 1; j < ACCENTS.length; j++) {
        const a = ACCENTS[i]!;
        const b = ACCENTS[j]!;
        const hueOnly = perceptualDistance(a.hex, b.hex);
        expect(hueOnly, `${a.name} vs ${b.name}`).toBeGreaterThan(20);
      }
    }
  });

  it('opens on two colours nothing could confuse', () => {
    expect(perceptualDistance(ACCENTS[0]!.hex, ACCENTS[1]!.hex)).toBeGreaterThan(40);
  });
});

describe('accentFor', () => {
  it('finds a colour whatever case it is written in', () => {
    expect(accentFor('#e8b93e')?.id).toBe('amber');
    expect(accentFor('#E8B93E')?.id).toBe('amber');
  });

  it('returns nothing for a colour outside the palette', () => {
    expect(accentFor('#123456')).toBeUndefined();
  });
});

describe('nextFreeAccent', () => {
  it('gives the first colour to the first person', () => {
    expect(nextFreeAccent([])).toBe(ACCENTS[0]!.hex);
  });

  it('skips what is already taken', () => {
    expect(nextFreeAccent([ACCENTS[0]!.hex])).toBe(ACCENTS[1]!.hex);
    expect(nextFreeAccent([ACCENTS[0]!.hex, ACCENTS[1]!.hex])).toBe(ACCENTS[2]!.hex);
  });

  it('does not care about case', () => {
    expect(nextFreeAccent(['#e8b93e'])).toBe(ACCENTS[1]!.hex);
  });

  it('falls back rather than failing once every colour is taken', () => {
    expect(nextFreeAccent(ACCENTS.map((a) => a.hex))).toBe(ACCENTS[0]!.hex);
  });
});
