/**
 * Central place for tunable values that affect user-perceived behavior.
 *
 * Constants here are NOT imported by `src/content/*` functions that
 * get serialized via `chrome.scripting.executeScript({ func })` — those
 * functions can't close over module-scope variables. Pass the value as
 * an arg instead.
 */

/**
 * How long a save-confirmation toast stays fully visible before
 * starting its fade-out. Total perceived duration ≈ this + 200 ms fade.
 */
export const TOAST_VISIBLE_MS = 3800;
