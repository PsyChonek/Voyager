import { Suspense, useMemo, useRef, type ComponentRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line, useTexture } from '@react-three/drei';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  RingGeometry,
  SRGBColorSpace,
  ShaderMaterial,
  Vector3,
  type Group,
  type Mesh,
  type Sprite,
  type SpriteMaterial,
} from 'three';
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
export type PositionMap = Map<BodyKey | 'hp', { pos: Vec3; visible: boolean; opacity?: number }>;

type Props = {
  tracks: Record<string, Track>;
  dayRef: RefObject<number>;
  mode: ScaleMode;
  craft: BodyKey[];
  positions: RefObject<PositionMap>;
  showTrails?: boolean;
  heliosphereRef?: RefObject<number>;
  animate?: boolean;
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

const rimShader = (color: string, power: number) =>
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
        float rim = pow(1.0 - abs(dot(vNormal, vView)), ${power.toFixed(1)});
        gl_FragColor = vec4(uColor, rim * uOpacity);
      }`,
    transparent: true,
    depthWrite: false,
    side: FrontSide,
    blending: AdditiveBlending,
  });

/** Soft radial glow used for the Sun corona and spacecraft beacons. */
function glowTexture(inner: string, outer: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

function useBodyPosition(
  name: BodyKey,
  track: Track,
  dayRef: RefObject<number>,
  mode: ScaleMode,
  positions: RefObject<PositionMap>,
) {
  const au = useRef<Vec3>([0, 0, 0]);
  const scene = useRef<Vec3>([0, 0, 0]);
  return (group: Group | null) => {
    const visible = positionAt(track, dayRef.current, au.current);
    if (visible) toScene(au.current, mode, scene.current);
    positions.current.set(name, { pos: scene.current, visible });
    if (group) {
      group.visible = visible;
      group.position.set(scene.current[0], scene.current[1], scene.current[2]);
    }
    return visible;
  };
}

const tmp = new Vector3();

function Planet({
  name,
  size,
  track,
  dayRef,
  mode,
  positions,
  spin,
}: {
  name: BodyKey;
  size: number;
  track: Track;
  dayRef: RefObject<number>;
  mode: ScaleMode;
  positions: RefObject<PositionMap>;
  spin: boolean;
}) {
  const group = useRef<Group>(null);
  const globe = useRef<Mesh>(null);
  const place = useBodyPosition(name, track, dayRef, mode, positions);
  const map = useTexture(`/textures/${name}.webp`);
  map.colorSpace = SRGBColorSpace;
  const ringMap = useTexture('/textures/saturn-ring.webp');
  const ring = useMemo(() => {
    if (name !== 'saturn') return null;
    const geo = new RingGeometry(size * 1.25, size * 2.3, 96, 1);
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getX(i), pos.getY(i));
      uv.setXY(i, (r - size * 1.25) / (size * 1.05), 0.5);
    }
    return geo;
  }, [name, size]);

  useFrame(({ camera }, dt) => {
    place(group.current);
    if (!group.current) return;
    // Keep tiny planets readable when the camera pulls far back.
    const d = camera.position.distanceTo(group.current.getWorldPosition(tmp));
    group.current.scale.setScalar(Math.max(1, (d * 0.0065) / size));
    if (spin && globe.current) globe.current.rotation.y += dt * 0.15;
  });

  return (
    <group ref={group}>
      <mesh ref={globe} rotation={[0.2, 0, 0]}>
        <sphereGeometry args={[size, 48, 32]} />
        <meshStandardMaterial map={map} roughness={0.9} metalness={0} />
      </mesh>
      {ring && (
        <mesh geometry={ring} rotation={[Math.PI / 2.25, 0, 0]}>
          <meshStandardMaterial
            map={ringMap}
            alphaMap={ringMap}
            transparent
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function Craft({
  name,
  color,
  track,
  dayRef,
  mode,
  positions,
  pulse,
}: {
  name: BodyKey;
  color: string;
  track: Track;
  dayRef: RefObject<number>;
  mode: ScaleMode;
  positions: RefObject<PositionMap>;
  pulse: boolean;
}) {
  const group = useRef<Group>(null);
  const halo = useRef<Sprite>(null);
  const place = useBodyPosition(name, track, dayRef, mode, positions);
  const tex = useMemo(() => glowTexture('#ffffff', color), [color]);

  useFrame(({ camera, clock }) => {
    place(group.current);
    if (!group.current) return;
    // Constant on-screen size, whatever the zoom.
    const d = camera.position.distanceTo(group.current.getWorldPosition(tmp));
    group.current.scale.setScalar(d * 0.028);
    if (halo.current) {
      const t = pulse ? (clock.elapsedTime * 0.8) % 1 : 0.4;
      halo.current.scale.setScalar(1 + t * 2.2);
      (halo.current.material as SpriteMaterial).opacity = 0.55 * (1 - t);
    }
  });

  return (
    <group ref={group}>
      <sprite scale={0.9}>
        <spriteMaterial map={tex} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <sprite ref={halo}>
        <spriteMaterial
          map={tex}
          color={color}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </sprite>
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
  dayRef: RefObject<number>;
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
  positions,
}: {
  mode: ScaleMode;
  strength: RefObject<number>;
  positions: RefObject<PositionMap>;
}) {
  const ts = useMemo(() => rimShader('#ff9d5c', 4), []);
  const hp = useMemo(() => rimShader('#6f9bff', 3), []);
  // The real heliosphere is not a sphere: the radii are the crossing distances
  // measured by the Voyagers (termination shock ~90 AU, heliopause ~120 AU).
  const rTs = radius(90, mode);
  const rHp = radius(120, mode);
  const hpTop = useMemo<Vec3>(() => [0, rHp, 0], [rHp]);
  useFrame(() => {
    const s = strength.current;
    ts.uniforms.uOpacity.value = 0.22 * s;
    hp.uniforms.uOpacity.value = 0.9 * s;
    positions.current.set('hp', { pos: hpTop, visible: s > 0.05, opacity: s });
  });
  return (
    <group>
      <mesh material={ts}>
        <sphereGeometry args={[rTs, 64, 32]} />
      </mesh>
      <mesh material={hp}>
        <sphereGeometry args={[rHp, 64, 32]} />
      </mesh>
    </group>
  );
}

export function Sun({ pulse }: { pulse: boolean }) {
  const map = useTexture('/textures/sun.webp');
  map.colorSpace = SRGBColorSpace;
  const glow = useMemo(() => glowTexture('rgba(255,244,214,1)', 'rgba(255,160,60,0.55)'), []);
  const corona = useRef<Sprite>(null);
  const globe = useRef<Mesh>(null);
  useFrame(({ camera, clock }, dt) => {
    if (globe.current) globe.current.rotation.y += dt * 0.05;
    if (!corona.current) return;
    const d = camera.position.length();
    const breathe = pulse ? 1 + Math.sin(clock.elapsedTime * 1.3) * 0.06 : 1;
    corona.current.scale.setScalar(Math.max(7, d * 0.09) * breathe);
  });
  return (
    <group>
      <mesh ref={globe}>
        <sphereGeometry args={[0.9, 48, 32]} />
        <meshBasicMaterial map={map} color="#ffd9a0" />
      </mesh>
      <sprite ref={corona}>
        <spriteMaterial map={glow} transparent depthWrite={false} blending={AdditiveBlending} />
      </sprite>
      <pointLight intensity={2.6} decay={0} distance={0} color="#fff3df" />
    </group>
  );
}

export function SolarSystem({
  tracks,
  dayRef,
  mode,
  craft,
  positions,
  showTrails = true,
  heliosphereRef,
  animate = true,
}: Props) {
  const planetScale = mode === 'log' ? 1 : 0.6;
  return (
    <group>
      <ambientLight intensity={0.12} />
      <Suspense fallback={null}>
        <Sun pulse={animate} />
        {PLANETS.filter((p) => tracks[p.key]).map((p) => (
          <group key={p.key}>
            <Orbit track={tracks[p.key]} color={p.color} mode={mode} />
            <Planet
              name={p.key}
              size={p.size * planetScale}
              track={tracks[p.key]}
              dayRef={dayRef}
              mode={mode}
              positions={positions}
              spin={animate}
            />
          </group>
        ))}
      </Suspense>
      {CRAFT.filter((c) => craft.includes(c.key) && tracks[c.key]).map((c) => (
        <group key={c.key}>
          <Trail
            track={tracks[c.key]}
            color={c.color}
            dayRef={dayRef}
            mode={mode}
            showTrails={showTrails}
          />
          <Craft
            name={c.key}
            color={c.color}
            track={tracks[c.key]}
            dayRef={dayRef}
            mode={mode}
            positions={positions}
            pulse={animate}
          />
        </group>
      ))}
      {heliosphereRef && (
        <Heliosphere mode={mode} strength={heliosphereRef} positions={positions} />
      )}
    </group>
  );
}
