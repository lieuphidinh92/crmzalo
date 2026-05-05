/**
 * use-count-up — animate a numeric ref toward the source value over a
 * short window using requestAnimationFrame. No external deps.
 */
import { ref, watch, type Ref } from 'vue';

export interface CountUpOptions {
  /** Animation duration in ms. Spec calls for 200-300ms. */
  duration?: number;
}

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function useCountUp(
  source: Ref<number | null | undefined>,
  opts: CountUpOptions = {},
): Ref<number> {
  const duration = opts.duration ?? 280;
  const displayed = ref<number>(0);
  let rafId: number | null = null;
  let lastTarget = 0;

  function animate(from: number, to: number) {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (prefersReducedMotion() || from === to) {
      displayed.value = to;
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const tRaw = Math.min(1, elapsed / duration);
      const t = easeOutCubic(tRaw);
      displayed.value = from + (to - from) * t;
      if (tRaw < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        displayed.value = to;
        rafId = null;
      }
    };
    rafId = requestAnimationFrame(step);
  }

  // `watch` with a getter — fires only when the source's numeric value
  // genuinely changes. `immediate: true` so the first concrete value
  // (e.g. server response) animates from 0 → target on initial paint.
  watch(
    () => Number(source.value ?? 0),
    (target) => {
      if (target === lastTarget) return; // dedup spurious re-fires
      animate(lastTarget, target);
      lastTarget = target;
    },
    { immediate: true },
  );

  return displayed;
}
