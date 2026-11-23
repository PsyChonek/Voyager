import { useMemo, useRef, type ComponentRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, Line } from '@react-three/drei';
import { AdditiveBlending, BackSide, Color, ShaderMaterial, type Group, type Mesh } from 'three';
import { indexAt, positionAt, type Track, type Vec3 } from '~/lib/ephemeris';
import { radius, toScene, type ScaleMode } from '~/lib/scale';

export type BodyKey =
  | 'v1'
  | 'v2'
  | 'p10'
  | 'p11'
  | 'nh'
  | 'mercury'
  | 'venus'
  | 'earth'
  | 'mars'
  | 'jupiter'
  | 'saturn'
  | 'uranus'
  | 'neptune';

export const PLANETS: { key: BodyKey; color: string; size: number }[] = [
  { key: 'mercury', color: '#b9a99a', size: 0.22 },
  { key: 'venus', color: '#e8c98a', size: 0.34 },
  { key: 'earth', color: '#4f9dff', size: 0.36 },
  { key: 'mars', color: '#e0694a', size: 0.28 },
  { key: 'jupiter', color: '#d9b48c', size: 0.95 },
  { key: 'saturn', color: '#e6d29c', size: 0.82 },
  { key: 'uranus', color: '#9be3e6', size: 0.6 },
  { key: 'neptune', color: '#5b7cff', size: 0.6 },
];

export const CRAFT: { key: BodyKey; color: string }[] = [
  { key: 'v1', color: '#ffb547' },
  { key: 'v2', color: '#5ec8ff' },
  { key: 'p10', color: '#c792ea' },
  { key: 'p11', color: '#9e86ff' },
  { key: 'nh', color: '#6fe0a3' },
];

/** Live scene positions, written every frame and read by camera directors. */
export type PositionMap = Map<BodyKey, { pos: Vec3; visible: boolean }>;

type Props = {
  tracks: Record<string, Track>;
  dayRef: MutableRefObject<number>;
  mode: ScaleMode;
  craft: BodyKey[];
  labels: Partial<Record<BodyKey, string>>;
  positions: MutableRefObject<PositionMap>;
  showTrails?: boolean;
  heliosphereRef?: MutableRefObject<number>;
  heliosphereLabels?: { ts: string; hp: string };
};

function scaledTrack(track: Track, mode: ScaleMode): Vec3[] {
  const out: Vec3[] = [];
  const au: Vec3 = [0, 0, 0];
  for (let i = 0; i < track.t.length; i++) {
    au[0] = track.p[3 * i];
    au[1] = track.p[3 * i + 1];
    au[2] = track.p[3 * i + 2];
    out.push(toScene(au, mode, [0, 0, 0]));
  }
  return out;
}

const rimShader = (color: string) =>
  new ShaderMaterial({
    uniforms: { uColor: { value: new Color(color) }, uOpacity: { value: 0 } },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uOpacity;
      varying vec3 vNormal; varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.5);
        gl_FragColor = vec4(uColor, rim * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: BackSide,
    blending: AdditiveBlending,
  });

function Body({
  name,
  color,
  size,
  label,
  track,
  dayRef,
  mode,
  positions,
  isCraft,
}: {
  name: BodyKey;
  color: string;
  size: number;
  label?: string;
  track: Track;
  dayRef: MutableRefObject<number>;
  mode: ScaleMode;
  positions: MutableRefObject<PositionMap>;
  isCraft: boolean;
}) {
  const group = useRef<Group>(null);
  const tag = useRef<HTMLDivElement>(null);
  const au = useRef<Vec3>([0, 0, 0]);
  const scene = useRef<Vec3>([0, 0, 0]);

  useFrame(() => {
    const visible = positionAt(track, dayRef.current, au.current);
    if (visible) toScene(au.current, mode, scene.current);
    positions.current.set(name, { pos: scene.current, visible });
    if (group.current) {
      group.current.visible = visible;
      group.current.position.set(scene.current[0], scene.current[1], scene.current[2]);
    }
    if (tag.current) tag.current.style.display = visible ? '' : 'none';
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[size, 24, 16]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {isCraft && (
        <mesh>
          <sphereGeometry args={[size * 2.6, 16, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} depthWrite={false} />
        </mesh>
      )}
      {name === 'saturn' && (
        <mesh rotation={[Math.PI / 2.3, 0, 0]}>
          <ringGeometry args={[size * 1.35, size * 2.1, 48]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} side={2} />
        </mesh>
      )}
      {label && (
        <Html
          position={[0, size + 0.25, 0]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            ref={tag}
            className={isCraft ? 'scene-tag scene-tag-craft' : 'scene-tag'}
            style={{ color }}
          >
            {label}
          </div>
        </Html>
      )}
    </group>
  );
}

function Trail({
  track,
  color,
  dayRef,
  mode,
  showTrails,
}: {
  track: Track;
  color: string;
  dayRef: MutableRefObject<number>;
  mode: ScaleMode;
  showTrails: boolean;
}) {
  const points = useMemo(() => scaledTrack(track, mode), [track, mode]);
  const line = useRef<ComponentRef<typeof Line>>(null);
  const tail = useRef<ComponentRef<typeof Line>>(null);
  const au = useRef<Vec3>([0, 0, 0]);
  const head = useRef<Vec3>([0, 0, 0]);

  useFrame(() => {
    const day = dayRef.current;
    const started = day >= track.t[0];
    const i = indexAt(track, day);
    if (line.current) {
      line.current.visible = started && showTrails;
      line.current.geometry.instanceCount = Math.max(0, i);
    }
    if (tail.current) {
      tail.current.visible = started && showTrails;
      if (started && positionAt(track, day, au.current)) {
        toScene(au.current, mode, head.current);
        const a = points[i];
        tail.current.geometry.setPositions([a[0], a[1], a[2], ...head.current]);
      }
    }
  });

  return (
    <>
      <Line ref={line} points={points} color={color} lineWidth={2} transparent opacity={0.9} />
      <Line
        ref={tail}
        points={[points[0], points[0]]}
        color={color}
        lineWidth={2}
        transparent
        opacity={0.9}
      />
    </>
  );
}

function Orbit({ track, color, mode }: { track: Track; color: string; mode: ScaleMode }) {
  const points = useMemo(() => scaledTrack(track, mode), [track, mode]);
  return <Line points={points} color={color} lineWidth={1} transparent opacity={0.22} />;
}

function Heliosphere({
  mode,
  strength,
  labels,
}: {
  mode: ScaleMode;
  strength: MutableRefObject<number>;
  labels?: { ts: string; hp: string };
}) {
  const ts = useMemo(() => rimShader('#ff9d5c'), []);
  const hp = useMemo(() => rimShader('#7aa8ff'), []);
  const tsMesh = useRef<Mesh>(null);
  const tags = useRef<HTMLDivElement>(null);
  useFrame(() => {
    const s = strength.current;
    ts.uniforms.uOpacity.value = 0.55 * s;
    hp.uniforms.uOpacity.value = 0.7 * s;
    if (tags.current) tags.current.style.opacity = String(s);
  });
  // The real heliosphere is not a sphere: the radii are the crossing distances
  // measured by the Voyagers (termination shock ~90 AU, heliopause ~120 AU).
  const rTs = radius(90, mode);
  const rHp = radius(120, mode);
  return (
    <group>
      <mesh ref={tsMesh} material={ts}>
        <sphereGeometry args={[rTs, 64, 32]} />
      </mesh>
      <mesh material={hp}>
        <sphereGeometry args={[rHp, 64, 32]} />
      </mesh>
      {labels && (
        <Html
          position={[0, rHp + 1, 0]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div ref={tags} className="scene-tag" style={{ color: '#9fbcff', opacity: 0 }}>
            {labels.hp}
          </div>
        </Html>
      )}
    </group>
  );
}

export function Sun() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[0.9, 32, 16]} />
        <meshBasicMaterial color="#fff1c4" />
      </mesh>
      <mesh>
        <sphereGeometry args={[1.8, 32, 16]} />
        <meshBasicMaterial color="#ffb547" transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh>
        <sphereGeometry args={[3.2, 32, 16]} />
        <meshBasicMaterial color="#ff8a3d" transparent opacity={0.06} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function SolarSystem({
  tracks,
  dayRef,
  mode,
  craft,
  labels,
  positions,
  showTrails = true,
  heliosphereRef,
  heliosphereLabels,
}: Props) {
  const planetScale = mode === 'log' ? 1 : 0.6;
  return (
    <group>
      <Sun />
      {PLANETS.filter((p) => tracks[p.key]).map((p) => (
        <group key={p.key}>
          <Orbit track={tracks[p.key]} color={p.color} mode={mode} />
          <Body
            name={p.key}
            color={p.color}
            size={p.size * planetScale}
            label={labels[p.key]}
            track={tracks[p.key]}
            dayRef={dayRef}
            mode={mode}
            positions={positions}
            isCraft={false}
          />
        </group>
      ))}
      {CRAFT.filter((c) => craft.includes(c.key) && tracks[c.key]).map((c) => (
        <group key={c.key}>
          <Trail
            track={tracks[c.key]}
            color={c.color}
            dayRef={dayRef}
            mode={mode}
            showTrails={showTrails}
          />
          <Body
            name={c.key}
            color={c.color}
            size={0.22}
            label={labels[c.key]}
            track={tracks[c.key]}
            dayRef={dayRef}
            mode={mode}
            positions={positions}
            isCraft
          />
        </group>
      ))}
      {heliosphereRef && (
        <Heliosphere mode={mode} strength={heliosphereRef} labels={heliosphereLabels} />
      )}
    </group>
  );
}
