import { describe, expect, it } from 'vitest';

import { hostnameOf } from './url.js';

describe('hostnameOf', () => {
  it('returns the hostname for a normal http URL', () => {
    expect(hostnameOf('https://example.com/path?q=1')).toBe('example.com');
  });

  it('returns the hostname for a URL with port and userinfo', () => {
    expect(hostnameOf('https://user:pass@example.com:8080/x')).toBe('example.com');
  });

  it('falls back to the raw input when URL parsing throws', () => {
    expect(hostnameOf('not-a-url')).toBe('not-a-url');
  });

  it('returns empty string for about:blank-style URLs (no host)', () => {
    expect(hostnameOf('about:blank')).toBe('');
  });

  it('does not throw on empty input', () => {
    expect(() => hostnameOf('')).not.toThrow();
    expect(hostnameOf('')).toBe('');
  });
});
