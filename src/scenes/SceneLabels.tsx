import { useRef, type RefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';
import type { PositionMap } from './SolarSystem';

export type LabelSpec = { key: string; text: string; color: string; craft?: boolean };
export type LabelEls = RefObject<Map<string, HTMLSpanElement>>;

/** DOM overlay with one tag per body. Lives outside the Canvas, positioned by LabelProjector. */
export function LabelOverlay({ labels, els }: { labels: LabelSpec[]; els: LabelEls }) {
  return (
    <div className="scene-labels" aria-hidden="true">
      {labels.map((l) => (
        <span
          key={l.key}
          ref={(el) => {
            if (el) els.current.set(l.key, el);
            else els.current.delete(l.key);
          }}
          className={l.craft ? 'scene-tag scene-tag-craft' : 'scene-tag'}
          style={{ color: l.color, visibility: 'hidden' }}
        >
          {l.text}
        </span>
      ))}
    </div>
  );
}

/** Projects scene positions to screen space every frame and moves the overlay tags. */
export function LabelProjector({
  positions,
  els,
}: {
  positions: RefObject<PositionMap>;
  els: LabelEls;
}) {
  const { camera, gl } = useThree();
  const v = useRef(new Vector3());
  const boxes = useRef<number[]>([]);
  useFrame(() => {
    const w = gl.domElement.clientWidth;
    const h = gl.domElement.clientHeight;
    // Labels are placed in insertion order (spacecraft first); later ones that
    // would overlap an earlier label are hidden so the inner planets stay legible.
    boxes.current.length = 0;
    els.current.forEach((el, key) => {
      const entry = positions.current.get(key as never);
      if (!entry || !entry.visible) {
        el.style.visibility = 'hidden';
        return;
      }
      v.current.set(entry.pos[0], entry.pos[1], entry.pos[2]).project(camera);
      if (v.current.z > 1 || Math.abs(v.current.x) > 1.2 || Math.abs(v.current.y) > 1.2) {
        el.style.visibility = 'hidden';
        return;
      }
      const x = ((v.current.x + 1) / 2) * w;
      const y = ((1 - v.current.y) / 2) * h;
      const bw = el.offsetWidth / 2 + 4;
      const top = y - 22;
      const b = boxes.current;
      for (let i = 0; i < b.length; i += 4) {
        if (x - bw < b[i + 2] && x + bw > b[i] && top < b[i + 3] && top + 16 > b[i + 1]) {
          el.style.visibility = 'hidden';
          return;
        }
      }
      b.push(x - bw, top, x + bw, top + 16);
      el.style.visibility = 'visible';
      el.style.opacity = String(entry.opacity ?? 1);
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -170%)`;
    });
  });
  return null;
}
