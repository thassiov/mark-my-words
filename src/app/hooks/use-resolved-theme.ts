import { useEffect } from 'preact/hooks';

import { useSettings } from '../../settings/use-settings.js';

/**
 * Apply the user's theme choice to `<html>` as a `dark` class.
 *
 * Three input modes from settings:
 *  - `light` / `dark`: the class is set/cleared unconditionally.
 *  - `auto`: tracks `prefers-color-scheme` via a live `matchMedia`
 *    subscription so an OS theme switch takes effect immediately
 *    without reopening the app.
 *
 * The class is written to `<html>` (not the React root) so portaled
 * content (the Sheet) and any future global stylesheets pick it up.
 */
export function useResolvedTheme(): void {
  const { settings } = useSettings();
  const theme = settings.theme;

  useEffect(() => {
    const html = document.documentElement;

    if (theme === 'light' || theme === 'dark') {
      apply(html, theme === 'dark');
      return;
    }

    const media = globalThis.matchMedia('(prefers-color-scheme: dark)');
    apply(html, media.matches);
    const listener = (e: MediaQueryListEvent) => {
      apply(html, e.matches);
    };
    media.addEventListener('change', listener);
    return () => {
      media.removeEventListener('change', listener);
    };
  }, [theme]);
}

function apply(html: HTMLElement, dark: boolean): void {
  html.classList.toggle('dark', dark);
}
