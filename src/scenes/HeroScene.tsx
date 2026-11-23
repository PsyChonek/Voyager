import { Suspense, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float, Sparkles, Stars } from '@react-three/drei';
import type { Group } from 'three';
import { VoyagerModel } from './VoyagerModel';
import { StudioLights } from './StudioLights';
import { useInView } from './useInView';
import { useReducedMotion, useWebGL } from '~/lib/motion';

function Probe({ still }: { still: boolean }) {
  const ref = useRef<Group>(null);
  const { viewport, pointer } = useThree();
  // Fit the model to the visible area so it never clips at narrow widths.
  const size = Math.min(5.2, viewport.width * 0.7, viewport.height * 0.7);
  const offsetX = viewport.width > viewport.height ? viewport.width * 0.22 : 0;
  useFrame((_, dt) => {
    if (!ref.current || still) return;
    ref.current.rotation.y += dt * 0.1;
    // Gentle parallax towards the pointer.
    ref.current.rotation.x += (0.3 + pointer.y * 0.15 - ref.current.rotation.x) * 0.04;
  });
  return (
    <Float enabled={!still} speed={1.2} rotationIntensity={0.25} floatIntensity={0.6}>
      <group ref={ref} position={[offsetX, 0.8, 0]} rotation={[0.3, -0.9, 0.1]}>
        <VoyagerModel size={size} />
      </group>
    </Float>
  );
}

export default function HeroScene({ label, noWebgl }: { label: string; noWebgl: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const support = useWebGL();
  const still = useReducedMotion();

  return (
    <div ref={wrap} className="hero-canvas" role="img" aria-label={label}>
      {support === false && <p className="scene-fallback">{noWebgl}</p>}
      {support && (
        <Canvas
          frameloop={inView ? 'always' : 'never'}
          dpr={[1, 1.75]}
          camera={{ position: [0, 0.4, 9], fov: 38 }}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        >
          <Stars radius={80} depth={40} count={2500} factor={3} fade speed={still ? 0 : 0.6} />
          {!still && (
            <Sparkles
              count={60}
              scale={[12, 8, 6]}
              size={2}
              speed={0.25}
              color="#ffd38a"
              opacity={0.6}
            />
          )}
          <Suspense fallback={null}>
            <StudioLights />
            <Probe still={still} />
          </Suspense>
        </Canvas>
      )}
    </div>
  );
}
