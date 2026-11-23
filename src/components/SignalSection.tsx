import { useEffect, useRef, useState } from 'react';
import { liveState, loadLive } from '~/lib/live';
import { prefersReducedMotion } from '~/lib/motion';
import { reportError } from '~/lib/errors';

type Labels = {
  sendLabel: string;
  sendHint: string;
  arrives: string;
  roundTrip: string;
  dsnTitle: string;
  dsnLoading: string;
  dsnNone: string;
  dsnUnavailable: string;
  dsnTracking: string;
  dsnSource: string;
  stations: Record<string, string>;
  earth: string;
  v1: string;
  v2: string;
};

type Link = {
  station: string;
  dish: string;
  craft: 'VGR1' | 'VGR2';
  rate: number;
  power: number | null;
};

const DSN_URL = '/api/dsn.xml';
const ANIM_MS = 5000;

function parseDsn(xml: string): Link[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const links: Link[] = [];
  let station = '';
  for (const el of Array.from(doc.documentElement.children)) {
    if (el.tagName === 'station') station = el.getAttribute('name') ?? '';
    if (el.tagName !== 'dish') continue;
    for (const target of Array.from(el.getElementsByTagName('target'))) {
      const name = target.getAttribute('name');
      if (name !== 'VGR1' && name !== 'VGR2') continue;
      const down = Array.from(el.getElementsByTagName('downSignal')).find(
        (s) => s.getAttribute('spacecraft') === name,
      );
      const power = Number(down?.getAttribute('power'));
      links.push({
        station,
        dish: (el.getAttribute('name') ?? '').replace(/^DSS(\d+)/, 'DSS-$1'),
        craft: name,
        rate: Number(down?.getAttribute('dataRate') ?? 0),
        power: Number.isFinite(power) && power !== 0 ? power : null,
      });
    }
  }
  return links;
}

function Dsn({ labels }: { labels: Labels }) {
  const [links, setLinks] = useState<Link[] | null | 'error'>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(DSN_URL, { cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error(`dsn HTTP ${r.status}`);
          return r.text();
        })
        .then((xml) => alive && setLinks(parseDsn(xml)))
        .catch(() => alive && setLinks('error'));
    load();
    const id = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="dsn panel">
      <h3>{labels.dsnTitle}</h3>
      <div aria-live="polite">
        {links === null && <p className="muted">{labels.dsnLoading}</p>}
        {links === 'error' && <p className="muted">{labels.dsnUnavailable}</p>}
        {Array.isArray(links) && links.length === 0 && <p>{labels.dsnNone}</p>}
        {Array.isArray(links) && links.length > 0 && (
          <ul className="dsn-list">
            {links.map((l) => (
              <li key={`${l.dish}-${l.craft}`}>
                <strong>{l.dish}</strong> ({labels.stations[l.station] ?? l.station}){' '}
                {labels.dsnTracking}{' '}
                <strong className={l.craft === 'VGR1' ? 'c-v1' : 'c-v2'}>
                  {l.craft === 'VGR1' ? labels.v1 : labels.v2}
                </strong>
                {l.rate > 0 && <span className="mono muted"> {l.rate} b/s</span>}
                {l.power !== null && <span className="mono muted"> {l.power} dBm</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="muted small">{labels.dsnSource}</p>
    </div>
  );
}

export default function SignalSection({ labels, locale }: { labels: Labels; locale: string }) {
  const [sending, setSending] = useState(false);
  const [arrival, setArrival] = useState<{ there: Date; back: Date } | null>(null);
  const pulse = useRef<SVGCircleElement>(null);
  const raf = useRef(0);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const send = async () => {
    try {
      const data = await loadLive();
      const now = Date.now();
      const s = liveState(data, 'v1', now).lightSeconds * 1000;
      setArrival({ there: new Date(now + s), back: new Date(now + 2 * s) });
    } catch (e) {
      reportError(e, { component: 'SignalSection' });
    }
    if (prefersReducedMotion()) return;
    setSending(true);
    const start = performance.now();
    const step = (t: number) => {
      const f = Math.min(1, (t - start) / ANIM_MS);
      if (pulse.current) {
        pulse.current.setAttribute('cx', String(60 + f * 480));
        pulse.current.setAttribute('opacity', String(f < 1 ? 1 : 0));
      }
      if (f < 1) raf.current = requestAnimationFrame(step);
      else setSending(false);
    };
    raf.current = requestAnimationFrame(step);
  };

  const fmt = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div className="signal-grid">
      <div className="panel">
        <svg viewBox="0 0 600 120" className="signal-svg" aria-hidden="true">
          <line
            x1="60"
            y1="60"
            x2="540"
            y2="60"
            stroke="#1f2a44"
            strokeWidth="2"
            strokeDasharray="6 6"
          />
          <circle cx="60" cy="60" r="16" fill="#4f9dff" />
          <text x="60" y="104" textAnchor="middle" fill="#a3aec2" fontSize="14">
            {labels.earth}
          </text>
          <circle cx="540" cy="60" r="7" fill="#ffb547" />
          <text x="540" y="104" textAnchor="middle" fill="#a3aec2" fontSize="14">
            {labels.v1}
          </text>
          <circle ref={pulse} cx="60" cy="60" r="6" fill="#ffd38a" opacity="0" />
        </svg>
        <button type="button" className="btn" onClick={send} disabled={sending}>
          {labels.sendLabel}
        </button>
        <p className="muted small">{labels.sendHint}</p>
        <p aria-live="polite" className="mono">
          {arrival && (
            <>
              {labels.arrives}: {fmt.format(arrival.there)}
              <br />
              {labels.roundTrip}: {fmt.format(arrival.back)}
            </>
          )}
        </p>
      </div>
      <Dsn labels={labels} />
    </div>
  );
}
