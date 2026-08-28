# the example home

House and chores for one flat, sized to it. The week is split so everyone gives
up the same **share of their own free time** — not the same number of hours —
with a running total that corrects for whoever actually did the work.

Migrated from a single-file prototype. See the migration plan for the phases.

## Running it

```bash
npm install
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and build to `dist/` |
| `npm test` | Vitest, once |
| `npm run test:watch` | Vitest, watching |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | oxlint |
| `npm run format` | Prettier |

## Layout

```
src/domain/   pure TypeScript — the scheduler and its arithmetic.
              Imports nothing from React, Supabase or three.js.
src/data/     the seed chore list and the default availability grids
```

`src/domain` is where every scheduling decision lives, and it is fully unit
tested. Anything that reaches for a browser API, the network or the DOM belongs
outside it.

### Conventions

- Clock times are **minutes from local midnight** (19:30 → `1170`).
- Days are **0..6 with Monday = 0**.
- A chore's `roomId` is `null` when it belongs to the whole home rather than one
  room. There is no magic `'flat'` string.
- An occurrence key is `` `${choreId}#${n}` `` and is **stable across a
  rebuild**, so ticking a job off survives a reshuffle.
