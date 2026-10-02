/** Class value accepted by `cn`: falsy entries are dropped. */
export type ClassValue = string | false | null | undefined | 0;

/**
 * Minimal class joiner — keeps JSX readable without pulling in a dependency.
 * No conflict resolution: when overriding a primitive's classes, pass
 * utilities that don't collide (or that win by Tailwind's ordering).
 */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
