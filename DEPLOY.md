# Deploying

The app is a static bundle plus a Supabase project. CI checks every push;
pushing to `main` publishes to GitHub Pages.

## What is actually secret

Nothing in the bundle. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are
designed to sit in public JavaScript — the publishable key identifies the
project, it does not grant anything. What protects the data is row-level
security and the invite system, both enforced in Postgres:

- every table has RLS on, and a member of one household sees nothing of another
- starting a household costs a founder invite, mintable only from the SQL
  editor
- joining one costs a household invite, single use, expiring in a week

So they live in repository **variables**, not secrets. A fork builds without
them and simply runs on-device, which is the honest fallback.

The keys that *are* secret — the service role key, the database password —
appear nowhere in this repository and are not needed to build or deploy.

## One-time setup

1. **Push the repo to GitHub.**

2. **Settings → Pages → Source: GitHub Actions.**

3. **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   The deploy fails loudly if these are missing, rather than quietly shipping a
   build that only ever stores data on the device it is opened on.

4. **Supabase → Authentication → URL Configuration.** Add the Pages URL to
   **Redirect URLs**, with a wildcard so magic links and invites both land:

   ```
   https://<user>.github.io/<repo>/**
   ```

   Set **Site URL** to the same origin. Without this, sign-in links bounce to
   `localhost:3000` and appear to do nothing.

## Deep links

GitHub Pages has no rewrite rules, so `/join/CODE` would 404. The build writes
`404.html` as a copy of `index.html`; Pages serves it, the app boots, reads the
path and carries on. The status code is still 404, which browsers ignore.

The base path is worked out by `actions/configure-pages` and passed to Vite, so
a project site at `/<repo>/` and a user site at `/` both work. Every link the
app builds goes through `appUrl()` so it carries the base.

## Before making the repository public

Two things to know.

**The floorplan is in the bundle.** `src/data/exampleHome.ts` is the geometry of
a real flat — room sizes, wall positions, where the bed is — and it is compiled
into the JavaScript anyone can download. The same document is already seeded in
Postgres, so the fix is to load it from there and drop it from the bundle. Worth
doing before the repo goes public, and not otherwise.

**Anyone can reach the sign-in screen.** They can create an account and then do
nothing at all: no household, no way to make one, no data. That is by design,
but it does mean rows accumulating in `auth.users`. Closing it completely means
turning off public sign-up and inviting people through the admin API from an
Edge Function.

## Running the checks locally

```
npm run typecheck
npm run lint
npm test        # 153 unit tests
npm run test:db # 51 schema tests, against a real Postgres from node_modules
npm run build
```

`test:db` needs no Docker and no network. It starts Postgres out of
`node_modules`, applies every migration, and exercises RLS and plpgsql. The
install-script approvals it depends on are pinned per platform in
`package.json` under `allowScripts`; bumping the version means re-approving,
which is the point of the mechanism.
