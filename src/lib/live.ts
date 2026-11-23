// Live distance and speed for the Voyagers, interpolated from /data/live.json.
import { dayFromDate } from './time';

export const LIGHT_KMS = 299_792.458;
export const AU_KM = 149_597_870.7;
export const LIGHT_DAY_KM = LIGHT_KMS * 86_400;

type LiveCraft = { t0: number; helio: number[]; geo: number[]; speed: number[] };
export type LiveData = {
  generated: string;
  stepDays: number;
  craft: Record<'v1' | 'v2', LiveCraft>;
};
export type LiveState = { fromEarth: number; fromSun: number; speed: number; lightSeconds: number };

let cache: Promise<LiveData> | null = null;

export function loadLive(): Promise<LiveData> {
  cache ??= fetch('/data/live.json').then((res) => {
    if (!res.ok) throw new Error(`live HTTP ${res.status}`);
    return res.json() as Promise<LiveData>;
  });
  return cache;
}

function sample(series: number[], x: number): number {
  const i = Math.max(0, Math.min(series.length - 2, Math.floor(x)));
  const f = x - i;
  return series[i] + (series[i + 1] - series[i]) * f;
}

export function liveState(data: LiveData, craft: 'v1' | 'v2', now: number): LiveState {
  const c = data.craft[craft];
  const x = (dayFromDate(now) - c.t0) / data.stepDays;
  const fromEarth = sample(c.geo, x);
  return {
    fromEarth,
    fromSun: sample(c.helio, x),
    speed: sample(c.speed, x),
    lightSeconds: fromEarth / LIGHT_KMS,
  };
}
