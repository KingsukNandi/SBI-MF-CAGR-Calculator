/**
 * Shared motion vocabulary.
 *
 * One place for durations and easing so the app moves consistently instead of
 * every component inventing its own timing. Values are deliberately short:
 * this is a tool people read numbers in, and animation that draws attention to
 * itself gets in the way.
 *
 * Every consumer should pair these with framer-motion's useReducedMotion and
 * collapse the duration to 0 when the user has asked for less motion.
 */

export const EASE = [0.22, 1, 0.36, 1]; // ease-out-quint: quick start, soft stop

export const DURATION = {
  instant: 0.12,
  fast: 0.18,
  base: 0.25,
  slow: 0.35,
};

/** Page level: a soft rise on enter, a soft fall on exit. */
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: DURATION.base, ease: EASE },
};

/** Crossfade for swapping one view for another in the same slot. */
export const viewTransition = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: DURATION.fast, ease: EASE },
};

/** Floating panel growing from its launcher in the bottom-right. */
export const popover = {
  initial: { opacity: 0, scale: 0.94, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: 8 },
  transition: { duration: DURATION.base, ease: EASE },
};

/** A chat bubble arriving; `mine` slides in from the sending side. */
export const bubble = (mine) => ({
  initial: { opacity: 0, y: 8, x: mine ? 8 : -8 },
  animate: { opacity: 1, y: 0, x: 0 },
  transition: { duration: DURATION.fast, ease: EASE },
});

/** Press feedback for anything clickable. */
export const tap = { scale: 0.97 };

/**
 * Stagger children into view. Capped deliberately: the original table used
 * `delay: index * 0.1`, which meant a 200-row file finished animating after
 * twenty seconds.
 */
export const stagger = (index, step = 0.03, cap = 0.3) => ({
  duration: DURATION.fast,
  ease: EASE,
  delay: Math.min(index * step, cap),
});

/** Collapse duration to zero when the user prefers reduced motion. */
export const withReducedMotion = (config, reduce) =>
  reduce ? { ...config, transition: { duration: 0 } } : config;
