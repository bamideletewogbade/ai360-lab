/**
 * Theme choice, persisted and applied to <html data-theme>.
 *
 * The person's stored choice can be an explicit light or dark, or "system",
 * which follows the operating system and keeps following it as it changes. The
 * resolved value ("light" or "dark") is what the CSS keys off, so stylesheets
 * only ever branch on `[data-theme="dark"]`.
 *
 * Someone who has never chosen gets light. AI360's light surface is the designed
 * default and the one the brand and marketing pages are built around, so a
 * first-time visitor on a dark-set device should still meet the intended look
 * rather than a theme they never asked for. Choosing "system" opts back in to
 * following the device.
 */

export const THEME_STORAGE_KEY = 'ai360-theme'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/** What applies before anyone has expressed a preference. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'light'

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function resolveTheme(choice: ThemeChoice, systemPrefersDark: boolean): ResolvedTheme {
  if (choice === 'light' || choice === 'dark') return choice
  return systemPrefersDark ? 'dark' : 'light'
}

/** Applies a resolved theme to the document. Client-only. */
export function applyResolvedTheme(resolved: ResolvedTheme) {
  const root = document.documentElement
  root.dataset.theme = resolved
  root.style.colorScheme = resolved
}

/**
 * Runs synchronously in <head> before first paint, stamping the theme on <html>
 * so there is no flash of the wrong colours. Dark applies only on an explicit
 * dark choice, or on "system" when the device asks for it; anything else —
 * including no stored choice at all — resolves to light. Kept dependency-free
 * and defensive because it executes before any application code.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;var dark=c==='dark'||(c==='system'&&m);var r=document.documentElement;r.dataset.theme=dark?'dark':'light';r.style.colorScheme=dark?'dark':'light';}catch(e){}})();`
