import type { ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation, useReducedMotion } from 'motion/react';
import { transition, type DURATION } from '../../lib/motion.ts';

/** Lazy feature bundle + reduced-motion awareness for islands that animate state changes. */
export function MotionRoot({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Token-based transition; collapses to an immediate change when reduced motion is requested. */
export function useMotionTransition(kind: keyof typeof DURATION) {
  return transition(kind, useReducedMotion());
}
