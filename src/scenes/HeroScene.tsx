import { Suspense, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import type { Group } from 'three';
import { VoyagerModel } from './VoyagerModel';
import { useInView } from './useInView';
import { hasWebGL, prefersReducedMotion } from '~/lib/motion';

function Spinning({ still }: { still: boolean }) {
  const ref = useRef<Group>(null);
  useFrame((state, dt) => {
    if (!ref.current) return;
    if (!still) ref.current.rotation.y += dt * 0.12;
    const t = state.clock.elapsedTime;
    ref.current.position.y = still ? 0 : Math.sin(t * 0.4) * 0.08;
  });
  return (
    <group ref={ref} rotation={[0.35, -0.9, 0.1]}>
      <VoyagerModel size={5.2} />
    </group>
  );
}

export default function HeroScene({ label, noWebgl }: { label: string; noWebgl: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const [support, setSupport] = useState<boolean | null>(null);
  const [still, setStill] = useState(false);

  useEffect(() => {
    setSupport(hasWebGL());
    setStill(prefersReducedMotion());
  }, []);

  return (
    <div ref={wrap} className="hero-canvas" role="img" aria-label={label}>
      {support === false && <p className="scene-fallback">{noWebgl}</p>}
      {support && (
        <Canvas
          frameloop={inView ? 'always' : 'never'}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0.6, 9], fov: 38 }}
          gl={{ antialias: true, powerPreference: 'high-performance' }}
        >
          <color attach="background" args={['#04060c']} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[-8, 4, 6]} intensity={3.2} color="#fff4e0" />
          <directionalLight position={[6, -2, -4]} intensity={0.6} color="#5ec8ff" />
          <Stars radius={80} depth={40} count={2500} factor={3} fade speed={still ? 0 : 0.4} />
          <Suspense fallback={null}>
            <Spinning still={still} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
