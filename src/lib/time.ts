/** Milliseconds of the J2000 epoch (2000-01-01 12:00 UTC). Horizons times are days from it. */
export const J2000_MS = Date.UTC(2000, 0, 1, 12);
export const DAY_MS = 86_400_000;

export const dayFromDate = (date: Date | number): number =>
  ((typeof date === 'number' ? date : date.getTime()) - J2000_MS) / DAY_MS;

export const dateFromDay = (day: number): Date => new Date(J2000_MS + day * DAY_MS);

/** Parse 'YYYY-MM-DD' or 'now' into a J2000 day number. */
export const dayFromIso = (iso: string): number =>
  iso === 'now' ? dayFromDate(Date.now()) : dayFromDate(Date.parse(`${iso}T12:00:00Z`));
