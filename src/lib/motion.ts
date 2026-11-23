import { useSyncExternalStore } from 'react';

const REDUCED = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia(REDUCED).matches;

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

let webgl: boolean | undefined;
const noSubscribe = () => () => {};

/** WebGL support on the client, null during server render. */
export function useWebGL(): boolean | null {
  return useSyncExternalStore(
    noSubscribe,
    () => (webgl ??= hasWebGL()),
    () => null,
  );
}

/** Follows the OS reduced-motion setting live. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}
