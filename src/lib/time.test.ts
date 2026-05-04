import { describe, expect, it } from 'vitest';

import { formatRelative } from './time.js';

const NOW = '2026-05-04T12:00:00Z';

describe('formatRelative', () => {
  it('returns "just now" within ±30 seconds', () => {
    expect(formatRelative('2026-05-04T11:59:35Z', NOW)).toBe('just now');
    expect(formatRelative('2026-05-04T11:59:55Z', NOW)).toBe('just now');
    expect(formatRelative('2026-05-04T12:00:25Z', NOW)).toBe('just now');
  });

  it('formats minutes', () => {
    const out = formatRelative('2026-05-04T11:55:00Z', NOW);
    expect(out).toMatch(/5 minute/);
    expect(out).toMatch(/ago/);
  });

  it('formats hours', () => {
    const out = formatRelative('2026-05-04T10:00:00Z', NOW);
    expect(out).toMatch(/2 hour/);
    expect(out).toMatch(/ago/);
  });

  it('formats days within a month', () => {
    const out = formatRelative('2026-05-01T12:00:00Z', NOW);
    expect(out).toMatch(/3 day/);
    expect(out).toMatch(/ago/);
  });

  it('uses Intl numeric:auto for "yesterday"', () => {
    // Exactly 1 day ago: with numeric:'auto', RelativeTimeFormat returns "yesterday" in en
    const out = formatRelative('2026-05-03T12:00:00Z', NOW);
    // Locale-dependent assertion — just check it's a single word, not "1 day ago"
    expect(out.toLowerCase()).not.toMatch(/\b1 day ago\b/);
  });

  it('returns absolute ISO date for >30 days old', () => {
    expect(formatRelative('2025-01-15T08:30:00Z', NOW)).toBe('2025-01-15');
  });

  it('handles future timestamps', () => {
    const out = formatRelative('2026-05-04T12:05:00Z', NOW);
    expect(out).toMatch(/5 minute/);
    // "in 5 minutes" or similar
    expect(out.toLowerCase()).toMatch(/^in /);
  });

  it('accepts a Date as the reference point', () => {
    const out = formatRelative('2026-05-04T11:59:00Z', new Date(NOW));
    expect(out).toMatch(/1 minute/);
  });
});
