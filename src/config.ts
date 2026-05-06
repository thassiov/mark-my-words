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
export const TOAST_VISIBLE_MS = 5000;

/**
 * Maximum number of characters allowed in a saved selection.
 * Selections exceeding this are rejected with a toast rather than saved.
 */
export const MAX_SELECTION_CHARS = 5000;
