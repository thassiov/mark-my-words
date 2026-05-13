import type { MmwExport } from './format.js';

/**
 * Pad a non-negative integer to two digits. Inlined here to avoid a
 * cross-module import for one line of logic.
 */
function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/**
 * Filename for an export written at `date`. Date components are read in
 * UTC so two machines in different timezones produce the same filename
 * for the same wall-clock export; the user-visible date inside the file
 * is the ISO `exportedAt` from the envelope.
 */
export function formatExportFilename(date: Date): string {
  const y = date.getUTCFullYear();
  const m = pad2(date.getUTCMonth() + 1);
  const d = pad2(date.getUTCDate());
  return `mark-my-words-${String(y)}-${m}-${d}.json`;
}

/**
 * Indirections that touch the DOM / global URL. Production callers use
 * the defaults; tests inject fakes to assert on the blob bytes,
 * filename, and lifecycle without spinning up jsdom-specific globals.
 */
export interface DownloadDeps {
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
  /** Hook for triggering the actual download (an `<a download>` click in prod). */
  triggerDownload?: (url: string, filename: string) => void;
  now?: () => Date;
}

/**
 * Serialise the envelope to JSON, wrap it in a Blob, and trigger a
 * browser download. Returns the filename used so callers (or tests) can
 * surface it in toasts / assertions.
 *
 * No streaming: at realistic library sizes (~1k records, ~150 MB worst
 * case with screenshots) a single string + Blob is fine and keeps the
 * code path trivial. Revisit only if a real user hits a memory cap.
 */
export function downloadExport(env: MmwExport, deps: DownloadDeps = {}): string {
  const createUrl = deps.createObjectURL ?? defaultCreateObjectURL;
  const revokeUrl = deps.revokeObjectURL ?? defaultRevokeObjectURL;
  const trigger = deps.triggerDownload ?? defaultTriggerDownload;
  const now = deps.now ?? (() => new Date());

  const filename = formatExportFilename(now());
  const json = JSON.stringify(env);
  const blob = new Blob([json], { type: 'application/json' });
  const url = createUrl(blob);
  try {
    trigger(url, filename);
  } finally {
    revokeUrl(url);
  }
  return filename;
}

function defaultCreateObjectURL(blob: Blob): string {
  return URL.createObjectURL(blob);
}

function defaultRevokeObjectURL(url: string): void {
  URL.revokeObjectURL(url);
}

function defaultTriggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
}
