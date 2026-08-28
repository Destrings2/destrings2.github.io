import { useSyncExternalStore } from 'react';

/**
 * One breakpoint decides the whole shell: below it the app is a single column
 * with a bottom tab bar, above it a three-pane desktop layout. 1100px is where
 * the scene and a 480px panel both stop being cramped.
 */
export const DESKTOP_QUERY = '(min-width: 1100px)';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}

export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
