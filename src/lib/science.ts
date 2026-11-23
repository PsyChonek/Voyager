// Client access to /data/science.json (NASA SPDF COHOWeb daily data).
export type Columns = {
  t: number[];
  r: (number | null)[];
  b: (number | null)[];
  v: (number | null)[];
  n: (number | null)[];
  low: (number | null)[];
  gcr: (number | null)[];
};
export type Science = {
  generated: string;
  source: string;
  craft: Record<'v1' | 'v2', { mission: Columns; heliopause: Columns }>;
};

let cache: Promise<Science> | null = null;

export function loadScience(): Promise<Science> {
  cache ??= fetch('/data/science.json').then((res) => {
    if (!res.ok) throw new Error(`science HTTP ${res.status}`);
    return res.json() as Promise<Science>;
  });
  return cache;
}

const utc = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 1000;

/** Boundary crossings measured by the Voyagers (NASA JPL). */
export const EVENTS = {
  v1: {
    ts: { date: '2004-12-16', t: utc('2004-12-16'), au: 94 },
    hp: { date: '2012-08-25', t: utc('2012-08-25'), au: 121.6 },
  },
  v2: {
    ts: { date: '2007-08-30', t: utc('2007-08-30'), au: 84 },
    hp: { date: '2018-11-05', t: utc('2018-11-05'), au: 119 },
  },
} as const;
