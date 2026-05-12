import { describe, expect, it } from 'vitest';

import { MMW_FORMAT_VERSION, parseExport, type MmwExport } from './format.js';

function validEnvelope(overrides: Partial<MmwExport> = {}): unknown {
  return {
    mmw: MMW_FORMAT_VERSION,
    exportedAt: '2026-05-12T10:00:00.000Z',
    exportedFrom: { version: '0.1.0', userAgent: 'test-ua' },
    meta: { schema_version: 2 },
    settings: { theme: 'auto' },
    records: [],
    ...overrides,
  };
}

describe('parseExport', () => {
  it('accepts a minimal well-formed envelope', () => {
    const result = parseExport(validEnvelope());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mmw).toBe(MMW_FORMAT_VERSION);
      expect(result.value.exportedFrom.version).toBe('0.1.0');
      expect(result.value.records).toEqual([]);
    }
  });

  it('accepts an envelope with multiple records carrying id+type', () => {
    const result = parseExport(
      validEnvelope({
        records: [
          { id: 'a', type: 'selection' },
          { id: 'b', type: 'page' },
          // Trailing fields are not validated structurally — the import
          // layer trusts read-side migration to normalise on first read.
          { id: 'c', type: 'selection', sourceUrl: 'https://x', extra: 1 },
        ] as unknown as MmwExport['records'],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.records).toHaveLength(3);
  });

  it('rejects non-objects as not-mmw', () => {
    for (const bad of [null, undefined, 0, 'x', [], true]) {
      const r = parseExport(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('not-mmw');
    }
  });

  it('rejects objects missing the mmw envelope as not-mmw', () => {
    const r = parseExport({ exportedAt: 'x', records: [] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('not-mmw');
  });

  it('rejects non-integer mmw values as not-mmw', () => {
    for (const bad of [1.5, 0, -1, '1', Number.NaN]) {
      const r = parseExport(validEnvelope({ mmw: bad as unknown as 1 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe('not-mmw');
    }
  });

  it('rejects future format versions with the actual numbers attached', () => {
    const r = parseExport(validEnvelope({ mmw: 999 as unknown as 1 }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'future-version') {
      expect(r.error.got).toBe(999);
      expect(r.error.supported).toBe(MMW_FORMAT_VERSION);
    } else {
      throw new Error('expected future-version error');
    }
  });

  it('flags malformed exportedAt', () => {
    const r = parseExport(validEnvelope({ exportedAt: 123 as unknown as string }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'malformed') {
      expect(r.error.reason).toMatch(/exportedAt/);
    } else {
      throw new Error('expected malformed error');
    }
  });

  it('flags malformed exportedFrom', () => {
    const r = parseExport(validEnvelope({ exportedFrom: 'nope' as unknown as never }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'malformed') {
      expect(r.error.reason).toMatch(/exportedFrom/);
    } else {
      throw new Error('expected malformed error');
    }
  });

  it('flags malformed records (not an array)', () => {
    const r = parseExport(validEnvelope({ records: 'nope' as unknown as never }));
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'malformed') {
      expect(r.error.reason).toMatch(/records/);
    } else {
      throw new Error('expected malformed error');
    }
  });

  it('flags malformed record entries (missing id)', () => {
    const r = parseExport(
      validEnvelope({
        records: [{ type: 'selection' }] as unknown as MmwExport['records'],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.kind === 'malformed') {
      expect(r.error.reason).toMatch(/records\[0\]\.id/);
    } else {
      throw new Error('expected malformed error');
    }
  });

  it('survives a JSON round-trip', () => {
    const built = validEnvelope({
      records: [{ id: 'a', type: 'selection' } as unknown as MmwExport['records'][number]],
    });
    const roundTripped = structuredClone(built);
    const r = parseExport(roundTripped);
    expect(r.ok).toBe(true);
  });
});
