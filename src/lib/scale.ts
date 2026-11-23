// Maps heliocentric ecliptic AU coordinates into scene units.
// Ecliptic (x, y, z) becomes three.js (x, z, -y) so ecliptic north is up.
import type { Vec3 } from './ephemeris';

export type ScaleMode = 'log' | 'real';

const LOG_K = 12;
const REAL_K = 0.4;

export function radius(r: number, mode: ScaleMode): number {
  return mode === 'log' ? LOG_K * Math.log1p(r) : REAL_K * r;
}

export function toScene(au: Vec3, mode: ScaleMode, out: Vec3): Vec3 {
  const r = Math.hypot(au[0], au[1], au[2]);
  const k = r === 0 ? 0 : radius(r, mode) / r;
  out[0] = au[0] * k;
  out[1] = au[2] * k;
  out[2] = -au[1] * k;
  return out;
}
