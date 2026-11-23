import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import { Vector3 } from 'three';
import { loadEphemeris, positionAt, type Track, type Vec3 } from '~/lib/ephemeris';
import { dateFromDay, dayFromDate, dayFromIso } from '~/lib/time';
import { hasWebGL, prefersReducedMotion } from '~/lib/motion';
import { reportError } from '~/lib/errors';
import type { ScaleMode } from '~/lib/scale';
import { CRAFT, PLANETS, SolarSystem, type BodyKey, type PositionMap } from './SolarSystem';
import { useInView } from './useInView';

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>;

type Labels = {
  play: string;
  pause: string;
  speed: string;
  date: string;
  scale: string;
  scaleLog: string;
  scaleReal: string;
  follow: string;
  followSun: string;
  trails: string;
  today: string;
  sceneLabel: string;
  tableTitle: string;
  body: string;
  distance: string;
  days: string;
  years: string;
  bodies: Record<BodyKey, string>;
  heliopause: string;
  terminationShock: string;
  loading: string;
};

const MIN_DAY = dayFromIso('1972-03-04');
const MAX_DAY = dayFromIso('2031-12-30');
const SPEEDS = [1, 7, 30, 90, 365]; // days per second
const ALL_CRAFT: BodyKey[] = ['v1', 'v2', 'p10', 'p11', 'nh'];
const FOLLOWABLE: (BodyKey | 'sun')[] = [
  'sun',
  'v1',
  'v2',
  'earth',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
];

function Follower({
  follow,
  positions,
  controls,
}: {
  follow: BodyKey | 'sun';
  positions: React.MutableRefObject<PositionMap>;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const last = useRef(new Vector3());
  const next = useRef(new Vector3());
  const prevFollow = useRef(follow);

  useFrame(() => {
    const c = controls.current;
    if (!c) return;
    const entry = follow === 'sun' ? null : positions.current.get(follow);
    const p: Vec3 = entry?.visible ? entry.pos : [0, 0, 0];
    next.current.set(p[0], p[1], p[2]);
    if (prevFollow.current !== follow) {
      // Jump to the new body keeping the current viewing direction.
      const offset = camera.position
        .clone()
        .sub(c.target)
        .setLength(follow === 'sun' ? 90 : 14);
      c.target.copy(next.current);
      camera.position.copy(next.current).add(offset);
      prevFollow.current = follow;
    } else {
      const delta = next.current.clone().sub(last.current);
      c.target.add(delta);
      camera.position.add(delta);
    }
    last.current.copy(next.current);
    c.update();
  });
  return null;
}

function Clock({
  dayRef,
  playing,
  speed,
  onTick,
}: {
  dayRef: React.MutableRefObject<number>;
  playing: boolean;
  speed: number;
  onTick: (day: number) => void;
}) {
  const acc = useRef(0);
  useFrame((_, dt) => {
    if (playing) {
      dayRef.current = Math.min(MAX_DAY, dayRef.current + dt * speed);
    }
    acc.current += dt;
    if (acc.current > 0.2) {
      acc.current = 0;
      onTick(dayRef.current);
    }
  });
  return null;
}

export default function ExplorerScene({ labels, locale }: { labels: Labels; locale: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap, '0px');
  const [tracks, setTracks] = useState<Record<string, Track> | null>(null);
  const [support, setSupport] = useState<boolean | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(90);
  const [mode, setMode] = useState<ScaleMode>('log');
  const [follow, setFollow] = useState<BodyKey | 'sun'>('sun');
  const [trails, setTrails] = useState(true);
  const [day, setDay] = useState(() => Math.round(dayFromDate(Date.now())));
  const dayRef = useRef(day);
  const positions = useRef<PositionMap>(new Map());
  const helio = useRef(0.6);
  const controls = useRef<OrbitControlsImpl>(null);

  useEffect(() => {
    const ok = hasWebGL();
    setSupport(ok);
    if (prefersReducedMotion()) setSpeed(30);
    loadEphemeris()
      .then(setTracks)
      .catch((e) => reportError(e, { scene: 'explorer' }));
  }, []);

  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
    [locale],
  );
  const num = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 }),
    [locale],
  );

  const distances = useMemo(() => {
    if (!tracks) return [];
    const out: Vec3 = [0, 0, 0];
    return [...ALL_CRAFT, ...PLANETS.map((p) => p.key)]
      .filter((k) => tracks[k])
      .map((k) => ({
        key: k,
        r: positionAt(tracks[k], day, out) ? Math.hypot(out[0], out[1], out[2]) : null,
      }));
  }, [tracks, day]);

  const setDayBoth = (d: number) => {
    dayRef.current = d;
    setDay(d);
  };

  const colors = Object.fromEntries([...CRAFT, ...PLANETS].map((b) => [b.key, b.color]));

  return (
    <div className="explorer">
      <div ref={wrap} className="explorer-canvas" role="img" aria-label={labels.sceneLabel}>
        {support === false && <p className="scene-fallback">{labels.loading}</p>}
        {support && !tracks && <p className="scene-fallback">{labels.loading}</p>}
        {support && tracks && (
          <Canvas
            frameloop={inView ? 'always' : 'never'}
            dpr={[1, 1.5]}
            camera={{ position: [60, 55, 95], fov: 50, near: 0.05, far: 4000 }}
          >
            <color attach="background" args={['#04060c']} />
            <Stars radius={500} depth={200} count={4000} factor={6} fade speed={0} />
            <SolarSystem
              tracks={tracks}
              dayRef={dayRef}
              mode={mode}
              craft={ALL_CRAFT}
              labels={labels.bodies}
              positions={positions}
              showTrails={trails}
              heliosphereRef={helio}
              heliosphereLabels={{ ts: labels.terminationShock, hp: labels.heliopause }}
            />
            <OrbitControls
              ref={controls}
              enableDamping
              makeDefault
              maxDistance={1500}
              minDistance={1}
            />
            <Follower follow={follow} positions={positions} controls={controls} />
            <Clock
              dayRef={dayRef}
              playing={playing}
              speed={speed}
              onTick={(d) => {
                const r = Math.round(d);
                setDay((prev) => (prev === r ? prev : r));
                if (d >= MAX_DAY) setPlaying(false);
              }}
            />
          </Canvas>
        )}
      </div>

      <div className="explorer-controls panel">
        <div className="row">
          <button
            type="button"
            className="btn"
            aria-pressed={playing}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? labels.pause : labels.play}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setDayBoth(Math.round(dayFromDate(Date.now())))}
          >
            {labels.today}
          </button>
          <p className="date mono" aria-live="off">
            {fmt.format(dateFromDay(day))}
          </p>
        </div>

        <label className="field wide">
          <span>{labels.date}</span>
          <input
            type="range"
            min={Math.round(MIN_DAY)}
            max={Math.round(MAX_DAY)}
            step={1}
            value={Math.round(day)}
            aria-valuetext={fmt.format(dateFromDay(day))}
            onChange={(e) => setDayBoth(Number(e.target.value))}
          />
        </label>

        <div className="grid">
          <label className="field">
            <span>{labels.speed}</span>
            <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {`${s} ${labels.days} / s`}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{labels.follow}</span>
            <select value={follow} onChange={(e) => setFollow(e.target.value as BodyKey | 'sun')}>
              {FOLLOWABLE.map((k) => (
                <option key={k} value={k}>
                  {k === 'sun' ? labels.followSun : labels.bodies[k]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="field">
            <legend>{labels.scale}</legend>
            <div className="seg">
              <button type="button" aria-pressed={mode === 'log'} onClick={() => setMode('log')}>
                {labels.scaleLog}
              </button>
              <button type="button" aria-pressed={mode === 'real'} onClick={() => setMode('real')}>
                {labels.scaleReal}
              </button>
            </div>
          </fieldset>
          <label className="field check">
            <input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} />
            <span>{labels.trails}</span>
          </label>
        </div>
      </div>

      <div className="panel explorer-table">
        <h2>{labels.tableTitle}</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">{labels.body}</th>
              <th scope="col" className="num">
                {labels.distance}
              </th>
            </tr>
          </thead>
          <tbody>
            {distances.map((d) => (
              <tr key={d.key}>
                <th scope="row">
                  <span
                    className="swatch"
                    style={{ background: colors[d.key] }}
                    aria-hidden="true"
                  />
                  {labels.bodies[d.key]}
                </th>
                <td className="num">{d.r === null ? '-' : num.format(d.r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
