/**
 * Stub leve para substituir a biblioteca `motion/react`.
 * Renderiza elementos HTML normais sem animação — elimina ~30KB do bundle.
 */
import React from "react";

type MotionProps = React.HTMLAttributes<HTMLElement> & {
  initial?: unknown;
  animate?: unknown;
  exit?: unknown;
  transition?: unknown;
  layout?: unknown;
  layoutId?: unknown;
  whileHover?: unknown;
  whileTap?: unknown;
  whileFocus?: unknown;
  drag?: unknown;
  dragConstraints?: unknown;
  onAnimationComplete?: unknown;
  variants?: unknown;
  [key: string]: unknown;
};

function makeElement(tag: string) {
  return function MotionElement({ initial, animate, exit, transition, layout, layoutId, whileHover, whileTap, whileFocus, drag, dragConstraints, onAnimationComplete, variants, ...rest }: MotionProps) {
    return React.createElement(tag, rest);
  };
}

const tags = [
  "div","span","p","a","button","ul","li","ol","h1","h2","h3","h4","h5","h6",
  "section","article","header","footer","main","nav","aside","form","input",
  "textarea","select","label","img","svg","path","circle","rect","g",
] as const;

export const motion: Record<string, ReturnType<typeof makeElement>> = {};
for (const tag of tags) {
  motion[tag] = makeElement(tag);
}

export function AnimatePresence({ children }: { children?: React.ReactNode; mode?: string; initial?: boolean }) {
  return <>{children}</>;
}
