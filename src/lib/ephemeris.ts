// Client-side access to the static trajectory data in /data/ephemeris.json.
export type RawTrack = { t: number[]; p: number[] };
export type Ephemeris = { generated: string; bodies: Record<string, RawTrack> };
export type Track = { t: Float64Array; p: Float64Array };
export type Vec3 = [number, number, number];

let cache: Promise<Record<string, Track>> | null = null;

export function loadEphemeris(): Promise<Record<string, Track>> {
  cache ??= fetch('/data/ephemeris.json')
    .then((res) => {
      if (!res.ok) throw new Error(`ephemeris HTTP ${res.status}`);
      return res.json() as Promise<Ephemeris>;
    })
    .then((eph) =>
      Object.fromEntries(
        Object.entries(eph.bodies).map(([key, raw]) => [
          key,
          { t: Float64Array.from(raw.t), p: Float64Array.from(raw.p) },
        ]),
      ),
    );
  return cache;
}

/** Index of the last sample with time <= day (binary search). */
export function indexAt(track: Track, day: number): number {
  let lo = 0;
  let hi = track.t.length - 1;
  if (day <= track.t[0]) return 0;
  if (day >= track.t[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.t[mid] <= day) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Heliocentric ecliptic position in AU at `day`, linearly interpolated.
 * Returns false before the track starts (spacecraft not launched yet).
 */
export function positionAt(track: Track, day: number, out: Vec3): boolean {
  const n = track.t.length;
  if (day < track.t[0]) return false;
  const i = indexAt(track, day);
  if (i >= n - 1) {
    out[0] = track.p[3 * (n - 1)];
    out[1] = track.p[3 * (n - 1) + 1];
    out[2] = track.p[3 * (n - 1) + 2];
    return true;
  }
  const f = (day - track.t[i]) / (track.t[i + 1] - track.t[i]);
  for (let k = 0; k < 3; k++) {
    const a = track.p[3 * i + k];
    out[k] = a + (track.p[3 * (i + 1) + k] - a) * f;
  }
  return true;
}
