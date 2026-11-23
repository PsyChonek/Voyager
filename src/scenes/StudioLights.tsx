import { Environment, Lightformer } from '@react-three/drei';

/** Local studio environment (no HDR download) so the metal and dish read well. */
export function StudioLights() {
  return (
    <>
      <ambientLight intensity={0.25} />
      <directionalLight position={[-6, 5, 6]} intensity={2.6} color="#fff1dc" />
      <directionalLight position={[6, -2, -5]} intensity={1.1} color="#5ec8ff" />
      <Environment resolution={256} frames={1}>
        <Lightformer
          form="rect"
          intensity={3}
          color="#fff4e0"
          position={[-5, 4, 5]}
          scale={[6, 6, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.5}
          color="#5ec8ff"
          position={[6, 0, -4]}
          scale={[8, 4, 1]}
        />
        <Lightformer form="ring" intensity={2} color="#ffb547" position={[0, 6, -6]} scale={4} />
      </Environment>
    </>
  );
}
