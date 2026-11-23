import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { VoyagerModel } from './VoyagerModel';
import { useInView } from './useInView';
import { useReducedMotion, useWebGL } from '~/lib/motion';

export default function ModelViewer({
  label,
  hint,
  noWebgl,
}: {
  label: string;
  hint: string;
  noWebgl: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const inView = useInView(wrap);
  const support = useWebGL();
  const still = useReducedMotion();

  return (
    <div ref={wrap} className="model-viewer" role="img" aria-label={label}>
      {support === false && <p className="scene-fallback">{noWebgl}</p>}
      {support && (
        <Canvas
          frameloop={inView ? 'always' : 'never'}
          dpr={[1, 1.75]}
          camera={{ position: [0, 1.5, 9], fov: 40 }}
        >
          <ambientLight intensity={0.4} />
          <directionalLight position={[-6, 5, 6]} intensity={3} color="#fff4e0" />
          <directionalLight position={[5, -3, -5]} intensity={0.7} color="#5ec8ff" />
          <Suspense fallback={null}>
            <VoyagerModel size={6} />
          </Suspense>
          <OrbitControls
            enableZoom={false}
            enablePan={false}
            autoRotate={!still}
            autoRotateSpeed={0.6}
          />
        </Canvas>
      )}
      <p className="model-hint muted">{hint}</p>
    </div>
  );
}
