import { describe, it, expect } from 'vitest';

import { isSemver } from './version.js';

describe('isSemver', () => {
  const cases: Array<{ name: string; input: string; want: boolean }> = [
    { name: 'plain release', input: '1.2.3', want: true },
    { name: 'with prerelease', input: '1.2.3-alpha.1', want: true },
    { name: 'with build metadata', input: '1.2.3+build.5', want: true },
    { name: 'missing patch', input: '1.2', want: false },
    { name: 'empty', input: '', want: false },
    { name: 'leading v', input: 'v1.2.3', want: false },
  ];

  for (const c of cases) {
    it(c.name, () => {
      expect(isSemver(c.input)).toBe(c.want);
    });
  }
});
