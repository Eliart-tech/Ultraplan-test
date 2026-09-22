"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Fades content in as it scrolls into view.
 *
 * Two rules make this safe to ship:
 *
 *  1. The element renders fully visible on the server and only becomes hidden
 *     once the effect below runs — so it is never lost to a crawler, to a user
 *     without JavaScript, or to someone who prefers reduced motion.
 *  2. Visibility is decided by a plain geometry check driven by a single shared
 *     scroll listener, not by an IntersectionObserver. Observers can be starved
 *     by programmatic jumps, anchor navigation, smooth scrolling and full-page
 *     captures, and text that stays at `opacity: 0` is text nobody can read.
 *     A long failsafe timer covers anything the geometry check still misses.
 */

/** Reveal once the element's top edge reaches this share of the viewport. */
const TRIGGER_RATIO = 0.94;
/** Last-resort reveal, for layout changes no scroll or resize event reports. */
const FAILSAFE_MS = 6000;

type Entry = { node: HTMLElement; reveal: () => void };

const watched = new Set<Entry>();
let frame = 0;
let listening = false;

function flush() {
  frame = 0;
  const limit = window.innerHeight * TRIGGER_RATIO;

  for (const entry of watched) {
    if (entry.node.getBoundingClientRect().top < limit) {
      watched.delete(entry);
      entry.reveal();
    }
  }

  if (watched.size === 0 && listening) {
    window.removeEventListener("scroll", schedule);
    window.removeEventListener("resize", schedule);
    listening = false;
  }
}

function schedule() {
  // Coalesce every scroll event of a frame into one batch of rect reads.
  if (frame === 0) frame = requestAnimationFrame(flush);
}

function watch(entry: Entry) {
  watched.add(entry);

  if (!listening) {
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    listening = true;
  }

  schedule();
  return () => {
    watched.delete(entry);
  };
}

export function Reveal({
  as: Tag = "div",
  delay = 0,
  className,
  children,
}: {
  as?: "div" | "li" | "section" | "article";
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"static" | "pending" | "visible">("static");

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen at mount: keep it visible rather than flashing it out.
    if (node.getBoundingClientRect().top < window.innerHeight * TRIGGER_RATIO) {
      setState("visible");
      return;
    }

    setState("pending");

    let settled = false;
    const reveal = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(failsafe);
      setState("visible");
    };

    const failsafe = window.setTimeout(reveal, FAILSAFE_MS);
    const unwatch = watch({ node, reveal });

    return () => {
      window.clearTimeout(failsafe);
      unwatch();
    };
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      className={cn(
        state === "pending" && "reveal-pending",
        state === "visible" && "reveal-visible",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
