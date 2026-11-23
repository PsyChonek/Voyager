import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Vector3, type Group } from 'three';

const MODEL_URL = '/models/voyager.glb';

/** NASA Voyager model (public domain), centred and scaled to `size` scene units. */
export function VoyagerModel({ size = 4 }: { size?: number }) {
  const { scene } = useGLTF(MODEL_URL);
  const model = useMemo(() => {
    const clone = scene.clone(true) as Group;
    const box = new Box3().setFromObject(clone);
    const center = box.getCenter(new Vector3());
    const extent = box.getSize(new Vector3());
    const k = size / Math.max(extent.x, extent.y, extent.z);
    clone.position.copy(center.multiplyScalar(-k));
    clone.scale.setScalar(k);
    return clone;
  }, [scene, size]);
  return <primitive object={model} />;
}

useGLTF.preload(MODEL_URL);
