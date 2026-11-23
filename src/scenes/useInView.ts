import { useEffect, useState, type RefObject } from 'react';

/** True while the element intersects the viewport. Used to pause offscreen WebGL loops. */
export function useInView(ref: RefObject<Element | null>, rootMargin = '100px'): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      rootMargin,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return inView;
}
