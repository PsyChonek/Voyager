// Build-time data pipeline. Fetches trajectories from JPL Horizons and
// daily science data from NASA SPDF, writes compact JSON to public/data/.
// Run: pnpm data
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(import.meta.dirname, '../public/data');
const HORIZONS = 'https://ssd.jpl.nasa.gov/api/horizons.api';
const SPDF = 'https://spdf.gsfc.nasa.gov/pub/data/voyager';
const J2000_JD = 2451545.0;
const END_DATE = '2032-01-01';

// Spacecraft and planets. `tol` is the decimation tolerance in AU.
const BODIES = [
  { key: 'v1', id: '-31', start: '1977-09-06', tol: 0.0005 },
  { key: 'v2', id: '-32', start: '1977-08-21', tol: 0.0005 },
  { key: 'p10', id: '-23', start: '1972-03-04', tol: 0.002, optional: true },
  { key: 'p11', id: '-24', start: '1973-04-07', tol: 0.002, optional: true },
  { key: 'nh', id: '-98', start: '2006-01-20', tol: 0.002, optional: true },
  { key: 'mercury', id: '199', start: '1972-01-01', tol: 0.01 },
  { key: 'venus', id: '299', start: '1972-01-01', tol: 0.01 },
  { key: 'earth', id: '399', start: '1972-01-01', tol: 0.01 },
  { key: 'mars', id: '499', start: '1972-01-01', tol: 0.01 },
  { key: 'jupiter', id: '599', start: '1972-01-01', tol: 0.002 },
  { key: 'saturn', id: '699', start: '1972-01-01', tol: 0.002 },
  { key: 'uranus', id: '799', start: '1972-01-01', tol: 0.002 },
  { key: 'neptune', id: '899', start: '1972-01-01', tol: 0.002 },
];

const log = (msg, extra = {}) =>
  process.stdout.write(JSON.stringify({ level: 'info', msg, ...extra }) + '\n');

async function fetchText(url, attempts = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'voyager-site-build' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i >= attempts) throw new Error(`${url}: ${err.message}`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
}

async function horizonsVectors({ id, center, start, stop, step }) {
  const params = new URLSearchParams({
    format: 'json',
    COMMAND: `'${id}'`,
    EPHEM_TYPE: 'VECTORS',
    CENTER: `'${center}'`,
    START_TIME: `'${start}'`,
    STOP_TIME: `'${stop}'`,
    STEP_SIZE: `'${step}'`,
    VEC_TABLE: '2',
    REF_PLANE: 'ECLIPTIC',
    OUT_UNITS: 'AU-D',
    CSV_FORMAT: 'YES',
    OBJ_DATA: 'NO',
  });
  const json = JSON.parse(await fetchText(`${HORIZONS}?${params}`));
  const result = json.result ?? '';
  const soe = result.indexOf('$$SOE');
  const eoe = result.indexOf('$$EOE');
  if (soe < 0 || eoe < 0) throw new Error(`Horizons ${id}: no data. ${result.slice(0, 400)}`);
  return result
    .slice(soe + 5, eoe)
    .trim()
    .split('\n')
    .map((line) => {
      const c = line.split(',').map((s) => s.trim());
      return {
        t: Number(c[0]) - J2000_JD,
        x: Number(c[2]),
        y: Number(c[3]),
        z: Number(c[4]),
        vx: Number(c[5]),
        vy: Number(c[6]),
        vz: Number(c[7]),
      };
    });
}

// Greedy decimation: keep a sample only when linear interpolation between
// kept neighbours would miss the real position by more than `tol` AU.
function decimate(rows, tol) {
  const kept = [rows[0]];
  let anchor = 0;
  for (let i = 2; i < rows.length; i++) {
    const a = rows[anchor];
    const b = rows[i];
    let ok = true;
    for (let j = anchor + 1; j < i; j++) {
      const p = rows[j];
      const f = (p.t - a.t) / (b.t - a.t);
      const dx = a.x + (b.x - a.x) * f - p.x;
      const dy = a.y + (b.y - a.y) * f - p.y;
      const dz = a.z + (b.z - a.z) * f - p.z;
      if (dx * dx + dy * dy + dz * dz > tol * tol) {
        ok = false;
        break;
      }
    }
    if (!ok) {
      anchor = i - 1;
      kept.push(rows[anchor]);
    }
  }
  kept.push(rows.at(-1));
  return kept;
}

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

async function buildEphemeris() {
  const bodies = {};
  for (const body of BODIES) {
    try {
      const rows = await horizonsVectors({
        id: body.id,
        center: '500@10',
        start: body.start,
        stop: END_DATE,
        step: '1d',
      });
      const kept = decimate(rows, body.tol);
      bodies[body.key] = {
        t: kept.map((r) => round(r.t, 3)),
        p: kept.flatMap((r) => [round(r.x, 5), round(r.y, 5), round(r.z, 5)]),
      };
      log('ephemeris', { body: body.key, raw: rows.length, kept: kept.length });
    } catch (err) {
      if (!body.optional) throw err;
      log('ephemeris skipped', { body: body.key, error: err.message });
    }
  }
  return { generated: new Date().toISOString(), frame: 'ecliptic J2000, heliocentric, AU', bodies };
}

// Dense recent window for the live counters: daily heliocentric and
// geocentric range plus heliocentric speed, interpolated on the client.
const AU_KM = 149597870.7;
const norm = (a, b, c) => Math.hypot(a, b, c);

async function buildLive() {
  const now = new Date();
  const start = new Date(now.getTime() - 30 * 864e5).toISOString().slice(0, 10);
  const stop = new Date(now.getTime() + 450 * 864e5).toISOString().slice(0, 10);
  const live = {
    generated: now.toISOString(),
    stepDays: 1,
    units: { range: 'km', speed: 'km/s' },
    craft: {},
  };
  for (const [key, id] of [
    ['v1', '-31'],
    ['v2', '-32'],
  ]) {
    const helio = await horizonsVectors({ id, center: '500@10', start, stop, step: '1d' });
    const geo = await horizonsVectors({ id, center: '500@399', start, stop, step: '1d' });
    live.craft[key] = {
      t0: helio[0].t,
      helio: helio.map((r) => Math.round(norm(r.x, r.y, r.z) * AU_KM)),
      geo: geo.map((r) => Math.round(norm(r.x, r.y, r.z) * AU_KM)),
      speed: helio.map((r) => round((norm(r.vx, r.vy, r.vz) * AU_KM) / 86400, 4)),
    };
  }
  return live;
}

// SPDF merged daily file: year, doy, hour, r, lat, lon, |B|, ..., V, ...,
// density, temp, LECP..., CRS 3.0-4.6 MeV, ..., CRS 133-155 MeV.
// Columns are 1-based in vy1mgd.txt; here 0-based.
const COL = { year: 0, doy: 1, r: 3, b: 6, v: 11, n: 14, low: 19, gcr: 28 };
const MISSING = (s) => /^-?9+\.?9*(e\+0?5)?$/i.test(s) || s === '9.999e+05';

function parseDaily(text) {
  return text
    .trim()
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((c) => c.length >= 29)
    .map((c) => {
      const val = (i) => (MISSING(c[i]) ? null : Number(c[i]));
      const year = Number(c[COL.year]);
      const doy = Number(c[COL.doy]);
      const ms = Date.UTC(year, 0, 1) + (doy - 1) * 864e5 + 432e5;
      return {
        t: ms / 1000,
        r: val(COL.r),
        b: val(COL.b),
        v: val(COL.v),
        n: val(COL.n),
        low: val(COL.low),
        gcr: val(COL.gcr),
      };
    });
}

// Average into fixed windows of `days`, skipping missing values.
function bin(rows, days) {
  const out = [];
  for (let i = 0; i < rows.length; i += days) {
    const chunk = rows.slice(i, i + days);
    const mean = (k) => {
      const vals = chunk.map((r) => r[k]).filter((v) => v !== null && Number.isFinite(v));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    out.push({
      t: chunk[Math.floor(chunk.length / 2)].t,
      r: mean('r'),
      b: mean('b'),
      v: mean('v'),
      n: mean('n'),
      low: mean('low'),
      gcr: mean('gcr'),
    });
  }
  return out;
}

const sig = (n) => (n === null ? null : Number(n.toPrecision(4)));

function columns(rows) {
  return {
    t: rows.map((r) => Math.round(r.t)),
    r: rows.map((r) => sig(r.r)),
    b: rows.map((r) => sig(r.b)),
    v: rows.map((r) => sig(r.v)),
    n: rows.map((r) => sig(r.n)),
    low: rows.map((r) => sig(r.low)),
    gcr: rows.map((r) => sig(r.gcr)),
  };
}

async function buildScience() {
  const science = {
    generated: new Date().toISOString(),
    source: 'NASA SPDF COHOWeb merged daily data (MAG, PLS, LECP, CRS)',
    units: {
      r: 'AU',
      b: 'nT',
      v: 'km/s',
      n: 'cm^-3',
      low: 'protons 3.0-4.6 MeV (CRS), 1/(cm2 s sr MeV)',
      gcr: 'protons 133-155 MeV, 1/(cm2 s sr MeV)',
    },
    craft: {},
  };
  const windows = { v1: [2011.5, 2013.5], v2: [2017.5, 2019.5] };
  for (const [key, file] of [
    ['v1', 'voyager1/merged/voyager1_daily.asc'],
    ['v2', 'voyager2/merged/voyager2_daily.asc'],
  ]) {
    const daily = parseDaily(await fetchText(`${SPDF}/${file}`));
    const [from, to] = windows[key].map((y) => Date.UTC(Math.floor(y), (y % 1) * 12, 1) / 1000);
    science.craft[key] = {
      mission: columns(bin(daily, 5)),
      heliopause: columns(daily.filter((r) => r.t >= from && r.t < to)),
    };
    log('science', { craft: key, days: daily.length });
  }
  return science;
}

await mkdir(OUT_DIR, { recursive: true });
const [ephemeris, live, science] = await Promise.all([
  buildEphemeris(),
  buildLive(),
  buildScience(),
]);
await writeFile(path.join(OUT_DIR, 'ephemeris.json'), JSON.stringify(ephemeris));
await writeFile(path.join(OUT_DIR, 'live.json'), JSON.stringify(live));
await writeFile(path.join(OUT_DIR, 'science.json'), JSON.stringify(science));
log('done', { out: OUT_DIR });
