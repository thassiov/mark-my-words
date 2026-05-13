import { describe, expect, it } from 'vitest';

import { downloadExport, formatExportFilename } from './download.js';
import { MMW_FORMAT_VERSION, type MmwExport } from './format.js';

function envelope(): MmwExport {
  return {
    mmw: MMW_FORMAT_VERSION,
    exportedAt: '2026-05-12T10:00:00.000Z',
    exportedFrom: { version: '0.1.0', userAgent: 'test-ua' },
    meta: {},
    settings: {},
    records: [],
  };
}

describe('formatExportFilename', () => {
  it('renders YYYY-MM-DD in UTC with zero-padding', () => {
    expect(formatExportFilename(new Date('2026-01-04T23:30:00.000Z'))).toBe(
      'mark-my-words-2026-01-04.json',
    );
  });

  it('does not shift days for timezones west of UTC', () => {
    // 2026-05-12T23:00:00-05:00 is 2026-05-13T04:00:00Z — must reflect UTC.
    const d = new Date('2026-05-13T04:00:00.000Z');
    expect(formatExportFilename(d)).toBe('mark-my-words-2026-05-13.json');
  });
});

describe('downloadExport', () => {
  it('writes a valid-JSON blob with the envelope bytes', async () => {
    let captured: Blob | null = null;
    const filename = downloadExport(envelope(), {
      createObjectURL: (b) => {
        captured = b;
        return 'blob:fake';
      },
      revokeObjectURL: () => undefined,
      triggerDownload: () => undefined,
      now: () => new Date('2026-05-12T10:00:00.000Z'),
    });
    expect(filename).toBe('mark-my-words-2026-05-12.json');
    expect(captured).not.toBeNull();
    expect(captured!.type).toBe('application/json');
    const text = await captured!.text();
    expect(JSON.parse(text)).toMatchObject({ mmw: MMW_FORMAT_VERSION });
  });

  it('passes the generated filename to the trigger', () => {
    let triggered: { url: string; filename: string } | null = null;
    downloadExport(envelope(), {
      createObjectURL: () => 'blob:abc',
      revokeObjectURL: () => undefined,
      triggerDownload: (url, filename) => {
        triggered = { url, filename };
      },
      now: () => new Date('2026-12-31T00:00:00.000Z'),
    });
    expect(triggered).toEqual({ url: 'blob:abc', filename: 'mark-my-words-2026-12-31.json' });
  });

  it('revokes the object URL even when the trigger throws', () => {
    let revoked: string | null = null;
    expect(() =>
      downloadExport(envelope(), {
        createObjectURL: () => 'blob:xyz',
        revokeObjectURL: (u) => {
          revoked = u;
        },
        triggerDownload: () => {
          throw new Error('user cancelled');
        },
      }),
    ).toThrow('user cancelled');
    expect(revoked).toBe('blob:xyz');
  });
});
