import { useEffect, useRef, useState } from 'react';
import { liveState, loadLive, LIGHT_DAY_KM, AU_KM, type LiveState } from '~/lib/live';
import { reportError } from '~/lib/errors';

type Labels = {
  v1: string;
  v2: string;
  fromEarth: string;
  fromSun: string;
  lightTime: string;
  speed: string;
  liveNote: string;
  lightDayProgress: string;
  km: string;
  au: string;
  kms: string;
};

type Props = {
  locale: string;
  labels: Labels;
  initial: Record<'v1' | 'v2', LiveState>;
  generated: string;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h} h ${String(m).padStart(2, '0')} min ${String(s).padStart(2, '0')} s`;
}

function Craft({
  id,
  name,
  state,
  labels,
  locale,
  primary,
}: {
  id: 'v1' | 'v2';
  name: string;
  state: LiveState;
  labels: Labels;
  locale: string;
  primary: boolean;
}) {
  const km = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const au = new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const sp = new Intl.NumberFormat(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const ratio = (state.fromEarth / LIGHT_DAY_KM) * 100;
  const pct = Math.min(100, ratio);
  return (
    <section className={`craft craft-${id}${primary ? ' primary' : ''}`} aria-label={name}>
      <h2 className="craft-name">{name}</h2>
      <dl>
        <div className="stat big">
          <dt>{labels.fromEarth}</dt>
          <dd className="mono">
            {km.format(state.fromEarth)} <abbr>{labels.km}</abbr>
          </dd>
        </div>
        <div className="stat">
          <dt>{labels.fromSun}</dt>
          <dd className="mono">
            {au.format(state.fromSun / AU_KM)} <abbr>{labels.au}</abbr>
          </dd>
        </div>
        <div className="stat">
          <dt>{labels.lightTime}</dt>
          <dd className="mono">{formatDuration(state.lightSeconds)}</dd>
        </div>
        <div className="stat">
          <dt>{labels.speed}</dt>
          <dd className="mono">
            {sp.format(state.speed)} <abbr>{labels.kms}</abbr>
          </dd>
        </div>
      </dl>
      {primary && (
        <div className="lightday">
          <div className="lightday-label">
            <span>{labels.lightDayProgress}</span>
            <span className="mono">{ratio.toFixed(3)} %</span>
          </div>
          <div
            className="ld-bar"
            role="progressbar"
            aria-label={labels.lightDayProgress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pct)}
          >
            <span style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}

export default function LiveCounter({ locale, labels, initial, generated }: Props) {
  const [state, setState] = useState(initial);
  const [updated, setUpdated] = useState(generated);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadLive()
      .then((data) => {
        if (!alive) return;
        setUpdated(data.generated);
        const tick = () =>
          setState({
            v1: liveState(data, 'v1', Date.now()),
            v2: liveState(data, 'v2', Date.now()),
          });
        tick();
        timer.current = window.setInterval(tick, 250);
      })
      .catch((e) => reportError(e, { component: 'LiveCounter' }));
    return () => {
      alive = false;
      window.clearInterval(timer.current);
    };
  }, []);

  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(updated));

  return (
    <div className="live">
      <div className="live-grid">
        <Craft id="v1" name={labels.v1} state={state.v1} labels={labels} locale={locale} primary />
        <Craft
          id="v2"
          name={labels.v2}
          state={state.v2}
          labels={labels}
          locale={locale}
          primary={false}
        />
      </div>
      <p className="live-note muted">
        {labels.liveNote} {date}.
      </p>
    </div>
  );
}
