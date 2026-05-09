import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { errorMessage } from '../lib/error.js';
import { formatRelative } from '../lib/time.js';
import { hostnameOf } from '../lib/url.js';
import { isRecordEvent } from '../shared/messages.js';
import { send } from '../shared/send.js';
import type { Record } from '../shared/types.js';

type Section = 'library' | 'archived' | 'settings';

function archiveLabel(busy: boolean, isArchived: boolean): string {
  if (busy) return '…';
  return isArchived ? 'Unarchive' : 'Archive';
}

interface BuildSubtitleArgs {
  error: string | null;
  records: readonly Record[] | null;
  filteredLength: number;
  query: string;
  noun: string;
}

function buildSubtitle({ error, records, filteredLength, query, noun }: BuildSubtitleArgs): string {
  if (error !== null) return `Couldn't connect: ${error}`;
  if (records === null) return 'Loading…';
  if (query.trim() === '') {
    const word = records.length === 1 ? noun : `${noun}s`;
    return `${String(records.length)} ${word}.`;
  }
  return `${String(filteredLength)} of ${String(records.length)} shown.`;
}

function ArchivedPill() {
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
      Archived
    </span>
  );
}

/**
 * Small uppercase pill identifying the kind of record on a list card.
 * Selections and pages share the same library; the badge keeps the user
 * oriented when scanning a mixed list.
 */
function TypeBadge({ type }: { type: 'selection' | 'page' }) {
  const styles =
    type === 'selection' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700';
  return (
    <span
      className={`mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles}`}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** Map a tag string to a stable HSL hue in [0, 360). */
function tagHue(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.trunc(h * 31 + (tag.codePointAt(i) ?? 0));
  }
  return ((h % 360) + 360) % 360;
}

function normalizeTag(t: string): string {
  return t.trim().toLowerCase();
}

const TAG_SUGGESTIONS_ID = 'mmw-tag-suggestions';

interface TagChipProps {
  tag: string;
  onClick?: () => void;
  onRemove?: () => void;
  /** Visual emphasis for the active filter chip. */
  active?: boolean;
}

function TagChip({ tag, onClick, onRemove, active = false }: TagChipProps) {
  const hue = tagHue(tag);
  const style = {
    background: `hsl(${String(hue)} 75% ${active ? '85%' : '92%'})`,
    color: `hsl(${String(hue)} 55% 25%)`,
    borderColor: active ? `hsl(${String(hue)} 60% 60%)` : 'transparent',
  };
  const interactive = onClick !== undefined;
  return (
    <span
      onClick={
        interactive
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
      style={style}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
        interactive ? 'cursor-pointer hover:brightness-95' : ''
      }`}
    >
      <span>#{tag}</span>
      {onRemove === undefined ? null : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag}`}
          className="ml-0.5 rounded-full px-1 text-[10px] leading-none hover:bg-black/10"
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Inline tag adder for list cards. Renders as a "+ tag" pill that turns
 * into a small input on click. Submits via `record:update`; the SW
 * broadcasts `record:updated` and the LibrarySection's listener swaps
 * the record in place.
 */
interface TagAdderProps {
  record: Record;
}

function TagAdder({ record }: TagAdderProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  async function commit() {
    const t = normalizeTag(value);
    setValue('');
    if (t.length === 0) {
      setOpen(false);
      return;
    }
    if ((record.tags ?? []).includes(t)) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await send({
        type: 'record:update',
        payload: {
          id: record.id,
          edit: { tags: [...(record.tags ?? []), t] },
        },
      });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:border-gray-400 hover:text-gray-700"
      >
        + tag
      </button>
    );
  }

  return (
    <input
      type="text"
      autoFocus
      list={TAG_SUGGESTIONS_ID}
      value={value}
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
      }}
      onInput={(e) => {
        setValue((e.target as HTMLInputElement).value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          void commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setValue('');
          setOpen(false);
        }
      }}
      onBlur={() => void commit()}
      placeholder="tag…"
      className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    />
  );
}

// ---------------------------------------------------------------------------
// Detail pane
// ---------------------------------------------------------------------------

interface DetailProps {
  record: Record;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (record: Record) => void;
  onTagClick: (tag: string) => void;
}

function RecordDetail({ record, onClose, onDeleted, onUpdated, onTagClick }: DetailProps) {
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(record.note ?? '');
  const [editTags, setEditTags] = useState<string[]>(record.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const archivedAt = record.archivedAt;
  const isArchived = archivedAt !== undefined;
  const tags = record.tags ?? [];

  useEffect(() => {
    setEditing(false);
    setEditNote(record.note ?? '');
    setEditTags(record.tags ?? []);
    setTagDraft('');
  }, [record.id]);

  function addTagFromDraft() {
    const t = normalizeTag(tagDraft);
    if (t.length === 0) return;
    if (editTags.includes(t)) {
      setTagDraft('');
      return;
    }
    setEditTags([...editTags, t]);
    setTagDraft('');
  }

  async function handleSave() {
    setSaving(true);
    try {
      // Cast: send()'s conditional return type doesn't narrow through
      // the generic, so we assert the concrete shape here.
      const updated = await send({
        type: 'record:update',
        payload: {
          id: record.id,
          edit: {
            note: editNote.trim() || undefined,
            tags: editTags,
          },
        },
      });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!globalThis.confirm('Delete this record?')) return;
    setDeleting(true);
    try {
      await send({ type: 'record:delete', payload: { id: record.id } });
      onDeleted(record.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleArchiveToggle() {
    setArchiving(true);
    try {
      const updated = await send({
        type: isArchived ? 'record:unarchive' : 'record:archive',
        payload: { id: record.id },
      });
      onUpdated(updated);
    } finally {
      setArchiving(false);
    }
  }

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <a
            href={record.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-blue-600 hover:underline"
            title={record.sourceUrl}
          >
            {hostnameOf(record.sourceUrl)}
          </a>
          {record.pageTitle ? (
            <p className="mt-0.5 truncate text-xs text-gray-500" title={record.pageTitle}>
              {record.pageTitle}
            </p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <span>Saved {formatRelative(record.createdAt)}</span>
            {archivedAt === undefined ? null : (
              <>
                <span aria-hidden="true">·</span>
                <span>Archived {formatRelative(archivedAt)}</span>
                <ArchivedPill />
              </>
            )}
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {editing ? null : (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void handleArchiveToggle();
            }}
            disabled={archiving}
            className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
          >
            {archiveLabel(archiving, isArchived)}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleDelete();
            }}
            disabled={deleting}
            className="rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            {deleting ? '…' : 'Delete'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close detail"
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            ×
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
        {record.type === 'selection' ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Selection
            </h2>
            <blockquote className="border-l-4 border-blue-200 bg-blue-50/50 px-3 py-2 text-sm leading-relaxed text-gray-900">
              {record.selectedText}
            </blockquote>
          </section>
        ) : null}

        {editing ? (
          <>
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Note
              </h2>
              <textarea
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                rows={3}
                placeholder="Add a personal note…"
                value={editNote}
                onInput={(e) => {
                  setEditNote((e.target as HTMLTextAreaElement).value);
                }}
              />
            </section>
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Tags
              </h2>
              {editTags.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {editTags.map((t) => (
                    <TagChip
                      key={t}
                      tag={t}
                      onRemove={() => {
                        setEditTags(editTags.filter((x) => x !== t));
                      }}
                    />
                  ))}
                </div>
              ) : null}
              <input
                type="text"
                list={TAG_SUGGESTIONS_ID}
                value={tagDraft}
                onInput={(e) => {
                  setTagDraft((e.target as HTMLInputElement).value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTagFromDraft();
                  } else if (e.key === 'Backspace' && tagDraft === '' && editTags.length > 0) {
                    e.preventDefault();
                    setEditTags(editTags.slice(0, -1));
                  }
                }}
                onBlur={addTagFromDraft}
                placeholder="Add a tag and press Enter…"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </section>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  void handleSave();
                }}
                disabled={saving}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditNote(record.note ?? '');
                  setEditTags(record.tags ?? []);
                  setTagDraft('');
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {!editing && record.note ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Note
            </h2>
            <p className="text-sm leading-relaxed text-gray-700">{record.note}</p>
          </section>
        ) : null}

        {editing ? null : (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Tags
            </h2>
            <div className="flex flex-wrap items-center gap-1.5">
              {tags.map((t) => (
                <TagChip
                  key={t}
                  tag={t}
                  onClick={() => {
                    onTagClick(t);
                  }}
                  onRemove={() => {
                    void send({
                      type: 'record:update',
                      payload: {
                        id: record.id,
                        edit: { tags: tags.filter((x) => x !== t) },
                      },
                    });
                  }}
                />
              ))}
              <TagAdder record={record} />
            </div>
          </section>
        )}

        {!editing &&
        record.type === 'selection' &&
        (record.contextBefore || record.contextAfter) ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              In context
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              <span className="text-gray-400">{record.contextBefore}</span>
              <mark className="bg-yellow-200 px-0.5 text-gray-900">{record.selectedText}</mark>
              <span className="text-gray-400">{record.contextAfter}</span>
            </p>
          </section>
        ) : null}

        {!editing && record.screenshotDataUrl ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Screenshot
            </h2>
            <img
              src={record.screenshotDataUrl}
              alt="Page at the moment of capture"
              className="w-full rounded-md border border-gray-200"
            />
          </section>
        ) : null}

        {!editing && record.iframeUrl ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Iframe source
            </h2>
            <a
              href={record.iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-blue-600 hover:underline"
            >
              {record.iframeUrl}
            </a>
          </section>
        ) : null}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Library section
// ---------------------------------------------------------------------------

interface LibrarySectionProps {
  /** When true, render the archived list instead of the active list. */
  archived: boolean;
}

function compareForView(a: Record, b: Record, archived: boolean): number {
  if (archived) {
    const aa = a.archivedAt ?? '';
    const bb = b.archivedAt ?? '';
    if (aa !== bb) return aa < bb ? 1 : -1;
    return a.id < b.id ? 1 : -1;
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

function LibrarySection({ archived }: LibrarySectionProps) {
  const [records, setRecords] = useState<Record[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // Support deep-link via URL hash: options.html#<record-id>
    const hash = location.hash.slice(1);
    return hash || null;
  });

  // Reload when the view (active vs archived) changes.
  useEffect(() => {
    setRecords(null);
    setError(null);
    send({ type: 'record:list', payload: { archived } })
      .then((items) => {
        setRecords(items);
      })
      .catch((err: unknown) => {
        setError(errorMessage(err));
      });
  }, [archived]);

  // Reactivity: patch local state when the SW broadcasts a mutation event.
  // A `record:updated` may move an item across the active/archived
  // boundary — drop it from this view if it no longer matches, insert
  // (sorted) if it just started matching.
  useEffect(() => {
    function matches(s: Record): boolean {
      return archived ? s.archivedAt !== undefined : s.archivedAt === undefined;
    }
    function handleEvent(msg: unknown) {
      if (!isRecordEvent(msg)) return;
      switch (msg.type) {
        case 'record:created': {
          if (!matches(msg.record)) return;
          setRecords((prev) => {
            const next = prev === null ? [msg.record] : [...prev, msg.record];
            next.sort((a, b) => compareForView(a, b, archived));
            return next;
          });

          break;
        }
        case 'record:deleted': {
          setRecords((prev) => prev?.filter((s) => s.id !== msg.id) ?? null);
          setSelectedId((id) => (id === msg.id ? null : id));

          break;
        }
        case 'record:updated': {
          const updated = msg.record;
          setRecords((prev) => {
            if (prev === null) return null;
            const exists = prev.some((s) => s.id === updated.id);
            if (matches(updated)) {
              const next = exists
                ? prev.map((s) => (s.id === updated.id ? updated : s))
                : [...prev, updated];
              next.sort((a, b) => compareForView(a, b, archived));
              return next;
            }
            // No longer matches our view — drop it and clear any selection.
            if (exists) {
              setSelectedId((id) => (id === updated.id ? null : id));
              return prev.filter((s) => s.id !== updated.id);
            }
            return prev;
          });

          break;
        }
        // No default
      }
    }
    chrome.runtime.onMessage.addListener(handleEvent);
    return () => {
      chrome.runtime.onMessage.removeListener(handleEvent);
    };
  }, [archived]);

  const allTags = useMemo(() => {
    if (records === null) return [] as string[];
    const set = new Set<string>();
    for (const s of records) for (const t of s.tags ?? []) set.add(t);
    return [...set].toSorted();
  }, [records]);

  // If the active tag disappears from the page (e.g. last record with it
  // moved to the other view), clear it.
  useEffect(() => {
    if (activeTag !== null && !allTags.includes(activeTag)) setActiveTag(null);
  }, [activeTag, allTags]);

  const filtered = useMemo(() => {
    if (records === null) return [];
    const q = query.trim().toLowerCase();
    return records.filter((s) => {
      if (activeTag !== null && !(s.tags ?? []).includes(activeTag)) return false;
      if (q === '') return true;
      const body = s.type === 'selection' ? s.selectedText : '';
      return (
        body.toLowerCase().includes(q) ||
        s.pageTitle.toLowerCase().includes(q) ||
        hostnameOf(s.sourceUrl).toLowerCase().includes(q) ||
        (s.note ?? '').toLowerCase().includes(q) ||
        (s.tags ?? []).some((t) => t.includes(q))
      );
    });
  }, [records, query, activeTag]);

  const selected = useMemo(
    () => (selectedId === null ? null : (records?.find((s) => s.id === selectedId) ?? null)),
    [records, selectedId],
  );

  useEffect(() => {
    // Wait for the initial fetch — otherwise a hash-derived selectedId
    // (deep-link from the save card's View →) gets cleared while
    // `filtered` is still empty during load, and the detail pane never
    // opens.
    if (records === null) return;
    if (selectedId !== null && !filtered.some((s) => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [records, filtered, selectedId]);

  function handleDeleted(id: string) {
    setRecords((prev) => prev?.filter((s) => s.id !== id) ?? null);
    setSelectedId(null);
  }

  function handleUpdated(updated: Record) {
    setRecords((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
  }

  const detailOpen = selected !== null;

  const heading = archived ? 'Archived' : 'Library';
  const noun = archived ? 'archived record' : 'record';
  const subtitle = buildSubtitle({
    error,
    records,
    filteredLength: filtered.length,
    query,
    noun,
  });

  return (
    <div className="h-full overflow-auto px-6 py-8">
      <datalist id={TAG_SUGGESTIONS_ID}>
        {allTags.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <header className="mb-6 flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{heading}</h2>
        {archived ? <ArchivedPill /> : null}
        <p className="basis-full text-sm text-gray-600">{subtitle}</p>
      </header>

      <div className="mb-4">
        <input
          type="search"
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
          }}
          placeholder={archived ? 'Filter archived…' : 'Filter records…'}
          aria-label="Filter records"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        {activeTag === null ? null : (
          <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
            <span>Filtering by</span>
            <TagChip
              tag={activeTag}
              active
              onRemove={() => {
                setActiveTag(null);
              }}
            />
          </div>
        )}
      </div>

      {records !== null && records.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          {archived ? (
            <>
              <p className="text-sm text-gray-700">No archived records.</p>
              <p className="mt-1 text-xs text-gray-500">
                Archive a record from the Library to keep it without cluttering the main list.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-700">No records yet.</p>
              <p className="mt-1 text-xs text-gray-500">
                Select text on any page and press Ctrl+Shift+S, or right-click → Save selection as
                record.
              </p>
            </>
          )}
        </div>
      ) : null}

      {records !== null && records.length > 0 && filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No matches for &quot;{query}&quot;.</p>
      ) : null}

      <div
        className="grid items-start gap-4 transition-[grid-template-columns] duration-300 ease-out"
        style={{
          gridTemplateColumns: detailOpen
            ? 'minmax(0, 5fr) minmax(0, 7fr)'
            : 'minmax(0, 1fr) minmax(0, 0fr)',
        }}
      >
        <ul className="space-y-2">
          {filtered.map((s) => {
            const isSelected = s.id === selectedId;
            return (
              <li
                key={s.id}
                onClick={() => {
                  setSelectedId(isSelected ? null : s.id);
                }}
                className={`cursor-pointer rounded-lg border bg-white p-4 transition-colors ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/40'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <TypeBadge type={s.type} />
                {s.type === 'selection' ? (
                  <p className="line-clamp-3 text-sm leading-relaxed text-gray-900">
                    {s.selectedText}
                  </p>
                ) : (
                  <p className="line-clamp-2 text-sm font-medium leading-relaxed text-gray-900">
                    {s.pageTitle || hostnameOf(s.sourceUrl)}
                  </p>
                )}
                {(s.tags ?? []).length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {(s.tags ?? []).map((t) => (
                      <TagChip
                        key={t}
                        tag={t}
                        active={t === activeTag}
                        onClick={() => {
                          setActiveTag(t === activeTag ? null : t);
                        }}
                      />
                    ))}
                  </div>
                ) : null}
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="min-w-0 flex-shrink truncate text-blue-600 hover:underline"
                    title={s.sourceUrl}
                  >
                    <span className="font-medium">{hostnameOf(s.sourceUrl)}</span>
                    {s.pageTitle ? (
                      <span className="ml-1 text-gray-500">· {s.pageTitle}</span>
                    ) : null}
                  </a>
                  <div className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
                    {archived ? <ArchivedPill /> : null}
                    <span>
                      {formatRelative(
                        archived && s.archivedAt !== undefined ? s.archivedAt : s.createdAt,
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div
          className={`sticky top-4 overflow-hidden transition-opacity duration-300 ${
            detailOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ height: 'calc(100vh - 4rem)' }}
        >
          {selected === null ? null : (
            <RecordDetail
              record={selected}
              onClose={() => {
                setSelectedId(null);
              }}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
              onTagClick={(t) => {
                setActiveTag((cur) => (cur === t ? null : t));
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings section
// ---------------------------------------------------------------------------

function SettingsSection() {
  return (
    <div className="h-full overflow-auto px-6 py-8">
      <header className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-gray-600">Extension behavior and preferences.</p>
      </header>

      <div className="max-w-lg space-y-4">
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h3 className="text-sm font-medium text-gray-900">Keyboard shortcut</h3>
          <p className="mt-1 text-sm text-gray-500">Save the selected text on any page.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <kbd className="rounded border border-gray-300 bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
              Ctrl+Shift+S
            </kbd>
            <span className="text-xs text-gray-400">Mac: ⌘⇧S</span>
            <span className="text-xs text-gray-400">·</span>
            <a
              href="chrome://extensions/shortcuts"
              className="text-xs text-blue-600 hover:underline"
            >
              Change in chrome://extensions/shortcuts
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function App() {
  const [section, setSection] = useState<Section>('library');

  let view: ComponentChildren;
  if (section === 'library') {
    view = <LibrarySection key="library" archived={false} />;
  } else if (section === 'archived') {
    view = <LibrarySection key="archived" archived={true} />;
  } else {
    view = <SettingsSection />;
  }

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <nav className="flex w-52 flex-shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <h1 className="mb-8 text-base font-semibold tracking-tight text-gray-900">mark-my-words</h1>
        <ul className="space-y-1">
          {(
            [
              { id: 'library', label: 'Library' },
              { id: 'archived', label: 'Archived' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => {
                  setSection(id);
                }}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  section === id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">{view}</div>
    </div>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
