import { useRef, useState } from 'preact/hooks';

import { downloadExport } from '../../../io/download.js';
import { buildExport } from '../../../io/export.js';
import { parseExport } from '../../../io/format.js';
import {
  ImportValidationError,
  importExport,
  type ConflictPolicy,
  type ImportSummary,
} from '../../../io/import.js';
import { errorMessage } from '../../../lib/error.js';

import { SettingRow, SettingsCard, Toggle } from './settings-primitives.js';

function summarizeImport(s: ImportSummary): string {
  const parts: string[] = [`${String(s.imported)} imported`];
  if (s.replaced > 0) parts.push(`${String(s.replaced)} replaced`);
  if (s.renamed > 0) parts.push(`${String(s.renamed)} kept as new`);
  if (s.skipped > 0) parts.push(`${String(s.skipped)} skipped (already present)`);
  return parts.join(', ');
}

function describeParseError(err: { kind: string; reason?: string; got?: number }): string {
  if (err.kind === 'not-mmw') return "this doesn't look like a mark-my-words export file";
  if (err.kind === 'future-version') {
    return `this file was made by a newer version (format ${String(err.got ?? '?')}). Update the extension first.`;
  }
  return err.reason ?? 'malformed file';
}

/**
 * Settings → Data card. Composes the export and import controls; each
 * sub-component owns its own busy / error state so they operate
 * independently.
 */
export function DataCard() {
  return (
    <SettingsCard title="Data">
      <ExportControls />
      <ImportControls />
    </SettingsCard>
  );
}

function ExportControls() {
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <SettingRow
        label="Include screenshots in export"
        description="Page screenshots are ~99% of an export's size — disable for a slim text-only file."
      >
        <Toggle checked={includeScreenshots} disabled={busy} onChange={setIncludeScreenshots} />
      </SettingRow>
      <SettingRow
        label="Export library"
        description="Download every record, page, setting, and meta entry as a single JSON file."
      >
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError(null);
            void buildExport({ includeScreenshots })
              .then((env) => {
                downloadExport(env);
              })
              .catch((err: unknown) => {
                setError(errorMessage(err));
              })
              .finally(() => {
                setBusy(false);
              });
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
        >
          {busy ? 'Working…' : 'Export'}
        </button>
      </SettingRow>
      {error === null ? null : (
        <div className="text-xs text-red-600 dark:text-red-400" role="alert">
          Export failed: {error}
        </div>
      )}
    </>
  );
}

function ImportControls() {
  const [conflict, setConflict] = useState<ConflictPolicy>('skip');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFileSelected = (file: File) => {
    setBusy(true);
    setError(null);
    setResult(null);
    void file
      .text()
      .then((text) => {
        const parsed = parseExport(JSON.parse(text) as unknown);
        if (!parsed.ok) {
          throw new Error(describeParseError(parsed.error));
        }
        return importExport(parsed.value, { conflict });
      })
      .then((summary) => {
        setResult(summarizeImport(summary));
      })
      .catch((err: unknown) => {
        if (err instanceof ImportValidationError) {
          setError(`record #${String(err.failure.index)}: ${err.failure.reason}`);
        } else {
          setError(errorMessage(err));
        }
      })
      .finally(() => {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = '';
      });
  };

  return (
    <>
      <SettingRow label="On duplicate id" description="What to do when a record id already exists.">
        <select
          value={conflict}
          disabled={busy}
          onChange={(e) => {
            setConflict((e.target as HTMLSelectElement).value as ConflictPolicy);
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
        >
          <option value="skip">Skip (keep local)</option>
          <option value="replace">Replace (restore from backup)</option>
          <option value="rename">Keep both (assign new id)</option>
        </select>
      </SettingRow>
      <SettingRow
        label="Import library"
        description="Load a JSON file produced by Export. Settings and meta are also merged."
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) onFileSelected(file);
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            fileRef.current?.click();
          }}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100 dark:hover:bg-stone-700"
        >
          {busy ? 'Working…' : 'Import'}
        </button>
      </SettingRow>
      {error === null ? null : (
        <div className="text-xs text-red-600 dark:text-red-400" role="alert">
          Import failed: {error}
        </div>
      )}
      {result === null ? null : (
        <div className="text-xs text-emerald-700 dark:text-emerald-400" role="status">
          {result}
        </div>
      )}
    </>
  );
}
