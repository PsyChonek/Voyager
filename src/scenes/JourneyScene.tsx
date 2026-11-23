import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import { Vector3 } from 'three';
import { loadEphemeris, type Track, type Vec3 } from '~/lib/ephemeris';
import { dateFromDay, dayFromIso } from '~/lib/time';
import { useReducedMotion, useWebGL } from '~/lib/motion';
import { reportError } from '~/lib/errors';
import { CRAFT, PLANETS, SolarSystem, type BodyKey, type PositionMap } from './SolarSystem';
import { useInView } from './useInView';
import { LabelOverlay, LabelProjector, type LabelSpec } from './SceneLabels';

type Chapter = { id: string; date: string };
type Props = {
  chapters: Chapter[];
  locale: string;
  labels: Partial<Record<BodyKey, string>>;
  heliosphereLabels: { ts: string; hp: string };
  sceneLabel: string;
  dateLabel: string;
  loadingLabel: string;
  noWebgl: string;
};

// Camera framing per chapter: what to look at and where the camera sits relative to it.
type Shot = { target: BodyKey | 'sun'; offset: Vec3; fromBehind?: boolean };
const SHOTS: Record<string, Shot> = {
  start: { target: 'earth', offset: [5, 9, 15] },
  jupiter: { target: 'jupiter', offset: [6, 10, 16] },
  saturn: { target: 'saturn', offset: [8, 11, 19] },
  uranus: { target: 'uranus', offset: [10, 12, 22] },
  neptune: { target: 'neptune', offset: [12, 14, 25] },
  'pale-blue-dot': { target: 'v1', offset: [0, 3, 0], fromBehind: true },
  'termination-shock': { target: 'sun', offset: [55, 50, 95] },
  heliopause: { target: 'sun', offset: [75, 58, 112] },
  today: { target: 'sun', offset: [92, 66, 128] },
};

/** Reads chapter progress from the DOM: 2.4 means 40% of the way from chapter 2 to chapter 3. */
function useChapterProgress(ids: string[]) {
  const progress = useRef(0);
  useEffect(() => {
    let centers: number[] = [];
    const measure = () => {
      centers = ids.map((id) => {
        const el = document.getElementById(`chapter-${id}`);
        if (!el) return 0;
        const r = el.getBoundingClientRect();
        return r.top + window.scrollY + r.height / 2;
      });
      update();
    };
    const update = () => {
      const s = window.scrollY + window.innerHeight / 2;
      if (!centers.length || s <= centers[0]) {
        progress.current = 0;
        return;
      }
      for (let i = 0; i < centers.length - 1; i++) {
        if (s < centers[i + 1]) {
          progress.current = i + (s - centers[i]) / (centers[i + 1] - centers[i]);
          return;
        }
      }
      progress.current = centers.length - 1;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    window.addEventListener('scroll', update, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update);
    };
  }, [ids]);
  return progress;
}

function Director({
  chapters,
  progress,
  dayRef,
  positions,
  helio,
  dateEl,
  locale,
  instant,
}: {
  chapters: Chapter[];
  progress: RefObject<number>;
  dayRef: RefObject<number>;
  positions: RefObject<PositionMap>;
  helio: RefObject<number>;
  dateEl: React.RefObject<HTMLParagraphElement | null>;
  locale: string;
  instant: boolean;
}) {
  const { camera } = useThree();
  const days = useRef(chapters.map((c) => dayFromIso(c.date)));
  const goalPos = useRef(new Vector3());
  const goalTarget = useRef(new Vector3());
  const lookAt = useRef(new Vector3());
  const a = useRef(new Vector3());
  const b = useRef(new Vector3());
  const ta = useRef(new Vector3());
  const tb = useRef(new Vector3());
  const lastLabel = useRef('');
  const fmt = useRef(
    new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  );
  const first = useRef(true);

  const shotInto = (id: string, outPos: Vector3, outTarget: Vector3) => {
    const shot = SHOTS[id] ?? SHOTS.today;
    const entry = shot.target === 'sun' ? null : positions.current.get(shot.target);
    const t = entry?.visible ? entry.pos : ([0, 0, 0] as Vec3);
    if (shot.fromBehind) {
      // Look back from beyond the spacecraft towards the Sun.
      outTarget.set(0, 0, 0);
      outPos
        .set(t[0], t[1], t[2])
        .multiplyScalar(1.18)
        .add(new Vector3(...shot.offset));
    } else {
      outTarget.set(t[0], t[1], t[2]);
      outPos.set(t[0] + shot.offset[0], t[1] + shot.offset[1], t[2] + shot.offset[2]);
    }
  };

  useFrame((_, dt) => {
    // Re-read "now" so the last chapter tracks the present.
    days.current[days.current.length - 1] = dayFromIso('now');
    const p = Math.min(Math.max(progress.current, 0), chapters.length - 1);
    const i = Math.min(Math.floor(p), chapters.length - 2);
    const f = p - i;
    const ease = f * f * (3 - 2 * f);
    dayRef.current = days.current[i] + (days.current[i + 1] - days.current[i]) * f;

    shotInto(chapters[i].id, a.current, ta.current);
    shotInto(chapters[i + 1].id, b.current, tb.current);
    goalPos.current.lerpVectors(a.current, b.current, ease);
    goalTarget.current.lerpVectors(ta.current, tb.current, ease);

    const k = instant || first.current ? 1 : 1 - Math.exp(-dt * 3.5);
    first.current = false;
    camera.position.lerp(goalPos.current, k);
    lookAt.current.lerp(goalTarget.current, k);
    camera.lookAt(lookAt.current);

    const tsIndex = chapters.findIndex((c) => c.id === 'termination-shock');
    helio.current = Math.min(1, Math.max(0, p - (tsIndex - 1)));

    const label = fmt.current.format(dateFromDay(dayRef.current));
    if (dateEl.current && label !== lastLabel.current) {
      dateEl.current.textContent = label;
      lastLabel.current = label;
    }
  });
  return null;
}

export default function JourneyScene(props: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const dateEl = useRef<HTMLParagraphElement>(null);
  const inView = useInView(wrap, '0px');
  const [tracks, setTracks] = useState<Record<string, Track> | null>(null);
  const support = useWebGL();
  const instant = useReducedMotion();
  const ids = useMemo(() => props.chapters.map((c) => c.id), [props.chapters]);
  const progress = useChapterProgress(ids);
  const dayRef = useRef(dayFromIso(props.chapters[0].date));
  const positions = useRef<PositionMap>(new Map());
  const helio = useRef(0);
  const labelEls = useRef(new Map<string, HTMLSpanElement>());
  const labelSpecs: LabelSpec[] = [
    ...[...CRAFT, ...PLANETS]
      .filter((b) => props.labels[b.key])
      .map((b) => ({
        key: b.key,
        text: props.labels[b.key]!,
        color: b.color,
        craft: b.key.startsWith('v'),
      })),
    { key: 'hp', text: props.heliosphereLabels.hp, color: '#9fbcff' },
  ];

  useEffect(() => {
    if (!support) return;
    loadEphemeris()
      .then(setTracks)
      .catch((e) => reportError(e, { scene: 'journey' }));
  }, [support]);

  return (
    <div ref={wrap} className="journey-canvas" role="img" aria-label={props.sceneLabel}>
      {support === false && <p className="scene-fallback">{props.noWebgl}</p>}
      {support && !tracks && <p className="scene-fallback">{props.loadingLabel}</p>}
      {support && tracks && (
        <Canvas
          frameloop={inView ? 'always' : 'never'}
          dpr={[1, 1.5]}
          camera={{ position: [10, 12, 20], fov: 50, near: 0.05, far: 2000 }}
        >
          <color attach="background" args={['#04060c']} />
          <Stars radius={400} depth={200} count={4000} factor={6} fade speed={0} />
          <SolarSystem
            tracks={tracks}
            dayRef={dayRef}
            mode="log"
            craft={['v1', 'v2']}
            positions={positions}
            heliosphereRef={helio}
            animate={!instant}
          />
          <LabelProjector positions={positions} els={labelEls} />
          <Director
            chapters={props.chapters}
            progress={progress}
            dayRef={dayRef}
            positions={positions}
            helio={helio}
            dateEl={dateEl}
            locale={props.locale}
            instant={instant}
          />
        </Canvas>
      )}
      {support && tracks && <LabelOverlay labels={labelSpecs} els={labelEls} />}
      <div className="journey-date" aria-hidden="true">
        <span>{props.dateLabel}</span>
        <p ref={dateEl} className="mono"></p>
      </div>
    </div>
  );
}
