import type { Record as MmwRecord, Settings } from '../shared/types.js';

/**
 * Export-envelope format version. Bumps when the *file shape* changes
 * (envelope keys, encoding, layout) — independent of the Dexie / SQLite
 * `schema_version` carried inside `meta`. Importers reject files whose
 * `mmw` value exceeds the value they know about, with a clear "update
 * your extension" message.
 */
export const MMW_FORMAT_VERSION = 1;

/**
 * Provenance recorded at export time. Surfaced in the import-preview UI
 * so the user can sanity-check what they're about to overwrite.
 */
export interface ExportProvenance {
  /** Extension version string (semver, including any `+gitsha` suffix). */
  version: string;
  /** `navigator.userAgent` of the browser that produced the file. */
  userAgent: string;
}

/**
 * The full library serialised as a single JSON document. Everything the
 * user owns is in here: records, settings, and the database `meta` blob
 * (schema_version, timestamps). Extension-local state (active mode,
 * picker handles, last-opened paths) is intentionally *not* included —
 * it's tied to an install, not to the data.
 */
export interface MmwExport {
  /** Format version. Must equal `MMW_FORMAT_VERSION` to be importable. */
  mmw: typeof MMW_FORMAT_VERSION;
  /** ISO 8601 timestamp; when this file was produced. */
  exportedAt: string;
  exportedFrom: ExportProvenance;
  /** Free-form key/value bag mirroring the Dexie `meta` store. */
  meta: Record<string, unknown>;
  /**
   * User settings keyed exactly like the in-memory `Settings` object.
   * `Partial` because future versions of the extension may add settings
   * that older exports don't carry — importers fill missing keys from
   * `DEFAULT_SETTINGS`.
   */
  settings: Partial<Settings>;
  /** Every record in the library, in arbitrary order. */
  records: MmwRecord[];
}

/**
 * Why a file couldn't be parsed as an `MmwExport`. Discriminated so the
 * UI can render a specific message per case (not a generic "bad file").
 */
export type ImportError =
  | { kind: 'not-mmw' }
  | { kind: 'future-version'; got: number; supported: number }
  | { kind: 'malformed'; reason: string };

export type ParseResult = { ok: true; value: MmwExport } | { ok: false; error: ImportError };

/**
 * Validate an arbitrary JSON value as an `MmwExport`. Returns a tagged
 * result rather than throwing — every callsite wants to branch on the
 * specific failure (wrong envelope vs future version vs malformed)
 * and exceptions make that awkward.
 *
 * Record shapes inside `records` are validated shallowly (object with
 * `id` + `type`); read-side migrations in `IdbRepo` handle the rest
 * once import lands rows in the DB.
 */
export function parseExport(json: unknown): ParseResult {
  if (!isPlainObject(json)) return notMmw();

  const mmw = json['mmw'];
  if (typeof mmw !== 'number' || !Number.isInteger(mmw) || mmw < 1) return notMmw();
  if (mmw > MMW_FORMAT_VERSION) {
    return {
      ok: false,
      error: { kind: 'future-version', got: mmw, supported: MMW_FORMAT_VERSION },
    };
  }

  const provenance = parseProvenance(json);
  if (!provenance.ok) return provenance;

  if (typeof json['exportedAt'] !== 'string') return malformed('exportedAt must be a string');
  if (!isPlainObject(json['meta'])) return malformed('meta must be an object');
  if (!isPlainObject(json['settings'])) return malformed('settings must be an object');
  if (!Array.isArray(json['records'])) return malformed('records must be an array');

  const recordsError = checkRecords(json['records']);
  if (recordsError !== null) return malformed(recordsError);

  return {
    ok: true,
    value: {
      mmw: MMW_FORMAT_VERSION,
      exportedAt: json['exportedAt'],
      exportedFrom: provenance.value,
      meta: json['meta'],
      settings: json['settings'],
      records: json['records'] as MmwRecord[],
    },
  };
}

type ProvenanceResult = { ok: true; value: ExportProvenance } | { ok: false; error: ImportError };

function parseProvenance(json: Record<string, unknown>): ProvenanceResult {
  const from = json['exportedFrom'];
  if (!isPlainObject(from)) return { ok: false, error: badShape('exportedFrom must be an object') };
  if (typeof from['version'] !== 'string') {
    return { ok: false, error: badShape('exportedFrom.version must be a string') };
  }
  if (typeof from['userAgent'] !== 'string') {
    return { ok: false, error: badShape('exportedFrom.userAgent must be a string') };
  }
  return { ok: true, value: { version: from['version'], userAgent: from['userAgent'] } };
}

function checkRecords(records: unknown[]): string | null {
  for (const [i, rec] of records.entries()) {
    if (!isPlainObject(rec)) return `records[${String(i)}] must be an object`;
    if (typeof rec['id'] !== 'string') return `records[${String(i)}].id must be a string`;
    if (typeof rec['type'] !== 'string') return `records[${String(i)}].type must be a string`;
  }
  return null;
}

function notMmw(): ParseResult {
  return { ok: false, error: { kind: 'not-mmw' } };
}
function malformed(reason: string): ParseResult {
  return { ok: false, error: badShape(reason) };
}
function badShape(reason: string): ImportError {
  return { kind: 'malformed', reason };
}
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
