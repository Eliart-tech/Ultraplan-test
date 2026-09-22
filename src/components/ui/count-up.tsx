"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Counts up to `to` the first time the element is scrolled into view.
 *
 * The final value is what renders on the server and what a user without
 * JavaScript, a crawler, or anyone who prefers reduced motion sees — the
 * animation only ever replaces a correct value with the same correct value.
 */
export function CountUp({
  to,
  prefix = "",
  duration = 1400,
}: {
  to: number;
  prefix?: string;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState(to);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let started = false;

    const run = () => {
      if (started) return;
      started = true;
      const start = performance.now();

      const tick = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // easeOutCubic
        setValue(Math.round(to * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };

      setValue(0);
      frame = requestAnimationFrame(tick);
    };

    const check = () => {
      if (node.getBoundingClientRect().top < window.innerHeight * 0.92) {
        run();
        window.removeEventListener("scroll", check);
      }
    };

    check();
    if (!started) window.addEventListener("scroll", check, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", check);
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {value}
    </span>
  );
}
