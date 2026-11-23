# Voyager

Interactive 3D story of Voyager 1 and 2 at https://voyager.vazac.dev (cs primary, en under `/en/`).

- Astro 7 static site, React Three Fiber islands for 3D, uPlot for charts.
- Real data, fetched at build time into `public/data/` by `pnpm data`:
  - `ephemeris.json`: heliocentric ecliptic trajectories (AU) for the Voyagers, Pioneers, New Horizons and planets, from NASA JPL Horizons, decimated to a fixed error tolerance.
  - `live.json`: daily range from Earth and Sun plus speed for the next ~450 days, for the live counters.
  - `science.json`: NASA SPDF COHOWeb merged daily data (MAG, PLS, CRS) for both craft.
- `/api/dsn.xml` is an nginx proxy (30 s cache) to NASA DSN Now, see `deploy/voyager.vazac.dev.nginx.conf`.
- 3D model and images: NASA/JPL, public domain. Image credits live in `src/data/images.json`.

## Commands

| Command               | What it does                                   |
| --------------------- | ---------------------------------------------- |
| `pnpm dev`            | Dev server                                     |
| `pnpm data`           | Refresh data from Horizons and SPDF            |
| `pnpm check`          | astro check + eslint + prettier                |
| `pnpm build`          | Static build into `dist/`                      |
| `pnpm website:deploy` | rsync `dist/` to the Oracle VM and curl-verify |
| `pnpm release`        | data + build + deploy                          |

## Hosting

Oracle VM, web root `/var/www/apps/voyager.vazac.dev/` (never under `/var/www/vazac.dev/`, that path is rsynced with `--delete` by the main site). One-time vhost and certificate setup: `deploy/setup-vhost.sh` (see the `mobile-app-website` skill for the sudo pattern).

`live.json` covers about 450 days ahead, so the site must be rebuilt at least yearly. `deploy.yml` rebuilds weekly once the repo is on GitHub.

## Optional env (all off when unset)

See `.env.example`: cookieless Umami analytics and a Sentry DSN. Nothing sets cookies, so no consent banner is needed. Adding any tracker that sets cookies requires consent gating first.
