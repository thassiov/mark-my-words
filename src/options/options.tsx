import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

import { downloadExport } from '../io/download.js';
import { buildExport } from '../io/export.js';
import { errorMessage } from '../lib/error.js';
import { formatRelative } from '../lib/time.js';
import { hostnameOf } from '../lib/url.js';
import { useSettings } from '../settings/use-settings.js';
import { isRecordEvent } from '../shared/messages.js';
import { send } from '../shared/send.js';
import type { Note, Record, Theme } from '../shared/types.js';

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
 * Muted ellipsis used to indicate "more before" / "more after" on a
 * card's title and excerpt. Different color from the body text so the
 * reader registers it as a UI cue, not part of the content.
 */
function MoreEllipsis() {
  return <span className="text-stone-400">…</span>;
}

/**
 * Site favicon for the card top-left, fetched via Google's s2 service.
 * On error (CSP-restricted page, no favicon, network down) the img
 * disappears and we render a neutral circle in its place.
 */
function Favicon({ sourceUrl }: { sourceUrl: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span className="inline-block h-6 w-6 flex-shrink-0 rounded-full border border-stone-300 bg-stone-100" />
    );
  }
  const host = hostnameOf(sourceUrl);
  const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  return (
    <img
      src={src}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 flex-shrink-0 rounded-full bg-white object-contain p-0.5 shadow-sm ring-1 ring-stone-200"
      onError={() => {
        setErrored(true);
      }}
    />
  );
}

/**
 * Split a string into (first ~N chars, rest), preferring a word
 * boundary near the cap. Used to render selectedText as
 * "title (big, bold)" + "excerpt continuation (small, muted)" on cards.
 */
function splitForCard(text: string, firstCap: number): { first: string; rest: string } {
  if (text.length <= firstCap) return { first: text, rest: '' };
  // Prefer a space near firstCap. If no space within the last 12 chars
  // of the cap, just hard-cut.
  const boundary = text.lastIndexOf(' ', firstCap);
  const cut = boundary < firstCap - 12 ? firstCap : boundary;
  return { first: text.slice(0, cut), rest: text.slice(cut + 1) };
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * Render the card title with a muted trailing-ellipsis when the
 * `selectedText`/`pageTitle` is longer than what fits in the title
 * slot. Selections are wrapped in typographic quotes; pages render
 * bare. The ellipsis lands inside the quotes for selections so it
 * reads as part of the truncation, not as part of the quote.
 */
function renderCardTitle(
  type: 'selection' | 'page',
  first: string,
  hasMore: boolean,
): ComponentChildren {
  const tail = hasMore ? <MoreEllipsis /> : null;
  if (type === 'selection') {
    return (
      <>
        “{first}
        {tail}”
      </>
    );
  }
  return (
    <>
      {first}
      {tail}
    </>
  );
}

interface CardProps {
  record: Record;
  isSelected: boolean;
  archived: boolean;
  activeTag: string | null;
  onClick: () => void;
  onTagClick: (t: string) => void;
}

/**
 * Library list card. Inspired by uiverse's chilly-bird-79 (overall
 * rhythm: top row → title → continuation → meta). Type is conveyed by
 * a 3px left-edge stripe — blue for selection, emerald for page — and
 * by the type label in the footer ("Selection: N words" / "Page").
 *
 * Top row: favicon + hostname | page title (truncated to fit).
 * Footer: type info on the left, relative date on the right.
 */
function Card({ record, isSelected, archived, activeTag, onClick, onTagClick }: CardProps) {
  const dateIso =
    archived && record.archivedAt !== undefined ? record.archivedAt : record.createdAt;
  const stripe = record.type === 'selection' ? 'bg-blue-400' : 'bg-emerald-400';
  const surface = isSelected
    ? 'bg-amber-100 shadow-md'
    : 'bg-amber-50/70 hover:-translate-y-0.5 hover:bg-amber-100/60 hover:shadow-md';

  const split =
    record.type === 'selection'
      ? splitForCard(record.selectedText, 60)
      : { first: record.pageTitle || hostnameOf(record.sourceUrl), rest: '' };

  return (
    <article
      onClick={onClick}
      className={`relative flex cursor-pointer flex-col overflow-hidden rounded-2xl py-4 pl-5 pr-4 transition-all duration-150 ${surface}`}
    >
      <span aria-hidden="true" className={`absolute inset-y-0 left-0 w-[3px] ${stripe}`} />

      <header className="flex min-w-0 items-center gap-2">
        <Favicon sourceUrl={record.sourceUrl} />
        <span
          className="min-w-0 flex-1 truncate text-xs text-stone-600"
          title={
            record.pageTitle
              ? `${hostnameOf(record.sourceUrl)} | ${record.pageTitle}`
              : record.sourceUrl
          }
        >
          <span className="font-medium">{hostnameOf(record.sourceUrl)}</span>
          {record.pageTitle ? (
            <>
              <span className="px-1 text-stone-400">|</span>
              <span>{record.pageTitle}</span>
            </>
          ) : null}
        </span>
      </header>

      <h3 className="mt-4 line-clamp-2 text-[17px] font-extrabold leading-tight text-stone-900">
        {renderCardTitle(record.type, split.first, split.rest.length > 0)}
      </h3>

      {split.rest.length > 0 ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-700">
          <MoreEllipsis />
          {split.rest}
        </p>
      ) : null}

      {(record.tags ?? []).length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {(record.tags ?? []).map((t) => (
            <TagChip
              key={t}
              tag={t}
              active={t === activeTag}
              onClick={() => {
                onTagClick(t);
              }}
            />
          ))}
        </div>
      ) : null}

      <footer className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs font-medium text-stone-600">
        <span className="flex items-center gap-2">
          {record.type === 'selection' ? (
            <span>Selection: {wordCount(record.selectedText)} words</span>
          ) : (
            <span>Page</span>
          )}
          {archived ? <ArchivedPill /> : null}
        </span>
        <span className="text-stone-500">{formatRelative(dateIso)}</span>
      </footer>
    </article>
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
  onDeleted: (id: string) => void;
  onUpdated: (record: Record) => void;
  onTagClick: (tag: string) => void;
}

function RecordDetail({ record, onDeleted, onUpdated, onTagClick }: DetailProps) {
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const archivedAt = record.archivedAt;
  const isArchived = archivedAt !== undefined;
  const tags = record.tags ?? [];

  function focusNoteEditor() {
    const el = noteRef.current;
    if (el === null) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
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
    <aside className="flex h-full min-w-0 flex-col overflow-hidden bg-white">
      <header className="space-y-3 border-b border-stone-200 px-6 py-5">
        {/* Top row: favicon + hostname | page title — mirrors the card. */}
        <div className="flex min-w-0 items-center gap-2">
          <Favicon sourceUrl={record.sourceUrl} />
          <a
            href={record.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 flex-1 truncate text-xs text-stone-600 hover:underline"
            title={
              record.pageTitle
                ? `${hostnameOf(record.sourceUrl)} | ${record.pageTitle}`
                : record.sourceUrl
            }
          >
            <span className="font-medium">{hostnameOf(record.sourceUrl)}</span>
            {record.pageTitle ? (
              <>
                <span className="px-1 text-stone-400">|</span>
                <span>{record.pageTitle}</span>
              </>
            ) : null}
          </a>
        </div>

        {/* Type + creation/archived dates. */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-stone-600">
          <span>
            {record.type === 'selection'
              ? `Selection: ${String(wordCount(record.selectedText))} words`
              : 'Page'}
          </span>
          <span aria-hidden="true" className="text-stone-400">
            •
          </span>
          <span className="text-stone-500">Saved {formatRelative(record.createdAt)}</span>
          {archivedAt === undefined ? null : (
            <>
              <span aria-hidden="true" className="text-stone-400">
                •
              </span>
              <span className="text-stone-500">Archived {formatRelative(archivedAt)}</span>
              <ArchivedPill />
            </>
          )}
        </div>

        {/* Tags (always shown so the +tag pill is reachable). */}
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

        {/* Action buttons — toast-style: uppercase, distinct accents. */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={focusNoteEditor}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-700 hover:text-white"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => {
              void handleArchiveToggle();
            }}
            disabled={archiving}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-700 transition-colors hover:bg-stone-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {archiveLabel(archiving, isArchived)}
          </button>
          <button
            type="button"
            onClick={() => {
              void handleDelete();
            }}
            disabled={deleting}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-stone-50 px-6 py-6">
        {/* Selection — boxed, larger, serif. The "money quote" of the panel. */}
        {record.type === 'selection' ? (
          <blockquote className="rounded-xl bg-white px-6 py-5 font-serif text-[19px] leading-relaxed text-stone-900 shadow-sm ring-1 ring-stone-200/70">
            “{record.selectedText}”
          </blockquote>
        ) : null}

        {/* In context — collapsible, default closed. */}
        {record.type === 'selection' && (record.contextBefore || record.contextAfter) ? (
          <Collapsible label="In context">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700">
              <span className="text-stone-400">{record.contextBefore}</span>
              <mark className="bg-yellow-200 px-0.5 text-stone-900">{record.selectedText}</mark>
              <span className="text-stone-400">{record.contextAfter}</span>
            </p>
          </Collapsible>
        ) : null}

        {/* Screenshot — collapsible, default closed. */}
        {record.screenshotDataUrl ? (
          <Collapsible label="Screenshot">
            <img
              src={record.screenshotDataUrl}
              alt="Page at the moment of capture"
              className="w-full rounded-md border border-stone-200"
            />
          </Collapsible>
        ) : null}

        {record.iframeUrl ? (
          <Collapsible label="Iframe source">
            <a
              href={record.iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-blue-600 hover:underline"
            >
              {record.iframeUrl}
            </a>
          </Collapsible>
        ) : null}

        {/* Notes — comment-thread shape. Single-note schema today; future
            iteration extends to a real comments array. */}
        <NoteSection record={record} onUpdated={onUpdated} textareaRef={noteRef} />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Detail-pane subcomponents
// ---------------------------------------------------------------------------

interface CollapsibleProps {
  label: string;
  children: ComponentChildren;
}

/**
 * Native `<details>` with shadcn-flavored chrome. Default closed; the
 * chevron rotates on open. No JS state — the browser handles it.
 */
function Collapsible({ label, children }: CollapsibleProps) {
  return (
    <details className="group rounded-lg bg-white px-4 py-3 ring-1 ring-stone-200/70">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[11px] font-bold uppercase tracking-wider text-stone-600 hover:text-stone-900">
        <span>{label}</span>
        <span
          aria-hidden="true"
          className="text-stone-400 transition-transform group-open:rotate-90"
        >
          ›
        </span>
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

interface NoteSectionProps {
  record: Record;
  onUpdated: (record: Record) => void;
  textareaRef: { current: HTMLTextAreaElement | null };
}

/**
 * Notes pane shaped like a comment thread: a textarea on top for
 * posting new notes, then a list of past notes (newest-first), each
 * with inline Edit and Delete affordances.
 *
 * - Post sends `record:add-note` with the textarea's text; the new
 *   note prepends to the list (the service handles ordering).
 * - Edit toggles inline edit mode for that note: textarea + Save /
 *   Cancel below it. Save sends `record:edit-note`; Cancel restores
 *   the read-only display without touching state.
 * - Delete prompts `confirm()` and sends `record:delete-note` —
 *   matches the record-level delete behavior.
 */
function NoteSection({ record, onUpdated, textareaRef }: NoteSectionProps) {
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const notes = record.notes ?? [];

  useEffect(() => {
    setDraft('');
  }, [record.id]);

  async function handlePost() {
    const text = draft.trim();
    if (text.length === 0) return;
    setPosting(true);
    try {
      const updated = await send({
        type: 'record:add-note',
        payload: { id: record.id, text },
      });
      onUpdated(updated);
      setDraft('');
    } finally {
      setPosting(false);
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-stone-600">Notes</h3>
      <div className="rounded-lg bg-white p-4 ring-1 ring-stone-200/70">
        <textarea
          ref={textareaRef}
          value={draft}
          onInput={(e) => {
            setDraft((e.target as HTMLTextAreaElement).value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void handlePost();
            }
          }}
          placeholder="Write a note…"
          rows={3}
          className="w-full resize-none border-0 bg-transparent text-sm leading-relaxed text-stone-900 placeholder-stone-400 focus:outline-none"
        />
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => {
              void handlePost();
            }}
            disabled={posting || draft.trim().length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>

      {notes.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {notes.map((note) => (
            <NoteItem key={note.id} record={record} note={note} onUpdated={onUpdated} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface NoteItemProps {
  record: Record;
  note: Note;
  onUpdated: (record: Record) => void;
}

/**
 * One row in the notes thread. Toggles between read-only display and
 * an inline edit form. Edit/Delete buttons sit in the item's header,
 * minimal styling, ghost-on-hover.
 */
function NoteItem({ record, note, onUpdated }: NoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const [busy, setBusy] = useState(false);

  // If the record's note text changes underneath us (broadcast event),
  // sync the draft when not actively editing.
  useEffect(() => {
    if (!editing) setDraft(note.text);
  }, [editing, note.text]);

  async function handleSave() {
    const text = draft.trim();
    if (text.length === 0 || text === note.text) {
      setEditing(false);
      setDraft(note.text);
      return;
    }
    setBusy(true);
    try {
      const updated = await send({
        type: 'record:edit-note',
        payload: { id: record.id, noteId: note.id, text },
      });
      onUpdated(updated);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!globalThis.confirm('Delete this note?')) return;
    setBusy(true);
    try {
      const updated = await send({
        type: 'record:delete-note',
        payload: { id: record.id, noteId: note.id },
      });
      onUpdated(updated);
    } finally {
      setBusy(false);
    }
  }

  const edited = note.updatedAt !== note.createdAt;

  return (
    <li className="rounded-lg bg-white p-4 ring-1 ring-stone-200/70">
      <header className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-stone-500">
          Posted {formatRelative(note.createdAt)}
          {edited ? (
            <span className="ml-1 text-stone-400">(edited {formatRelative(note.updatedAt)})</span>
          ) : null}
        </span>
        <div className="flex items-center gap-1">
          {editing ? null : (
            <button
              type="button"
              onClick={() => {
                setEditing(true);
              }}
              disabled={busy}
              className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-700 hover:text-white disabled:opacity-50"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              void handleDelete();
            }}
            disabled={busy}
            className="rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </header>

      {editing ? (
        <>
          <textarea
            value={draft}
            onInput={(e) => {
              setDraft((e.target as HTMLTextAreaElement).value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSave();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(note.text);
                setEditing(false);
              }
            }}
            rows={3}
            className="mt-2 w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
            autoFocus
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setDraft(note.text);
                setEditing(false);
              }}
              disabled={busy}
              className="rounded-md border border-stone-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                void handleSave();
              }}
              disabled={busy || draft.trim().length === 0}
              className="rounded-md bg-stone-900 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
          {note.text}
        </p>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Library section
// ---------------------------------------------------------------------------

interface LibrarySectionProps {
  /** When true, render the archived list instead of the active list. */
  archived: boolean;
}

// ---------------------------------------------------------------------------
// Sheet (slide-in side panel)
// ---------------------------------------------------------------------------

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * Right-anchored slide-in side panel. Hand-rolled (instead of pulling
 * Radix Dialog) since we only need ESC/backdrop dismiss and a portal.
 *
 * Mounted via createPortal to document.body so the panel and its
 * backdrop sit above the rest of the options page layout regardless of
 * where the parent component tree is.
 */
function Sheet({ open, onClose, children }: SheetProps) {
  // Mount lifecycle: render only after a small async tick once `open`
  // flips, so the slide-in transition runs from off-screen-right.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      // Next frame: flip `visible` so the transition runs.
      const id = requestAnimationFrame(() => {
        setVisible(true);
      });
      return () => {
        cancelAnimationFrame(id);
      };
    }
    setVisible(false);
    // Keep mounted long enough for the slide-out transition to finish.
    const id = setTimeout(() => {
      setMounted(false);
    }, 220);
    return () => {
      clearTimeout(id);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 w-full transform bg-white shadow-2xl transition-transform duration-200 ease-out sm:w-[50vw] ${
          visible ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="absolute -left-5 top-6 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-xl text-stone-700 shadow-md transition-colors hover:bg-stone-50"
        >
          ×
        </button>
        {children}
      </aside>
    </div>,
    document.body,
  );
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
      const notesText = (s.notes ?? []).map((n) => n.text).join(' ');
      return (
        body.toLowerCase().includes(q) ||
        s.pageTitle.toLowerCase().includes(q) ||
        hostnameOf(s.sourceUrl).toLowerCase().includes(q) ||
        notesText.toLowerCase().includes(q) ||
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

      <div className="grid grid-cols-1 items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((s) => {
          const isSelected = s.id === selectedId;
          return (
            <Card
              key={s.id}
              record={s}
              isSelected={isSelected}
              archived={archived}
              activeTag={activeTag}
              onClick={() => {
                setSelectedId(isSelected ? null : s.id);
              }}
              onTagClick={(t) => {
                setActiveTag(t === activeTag ? null : t);
              }}
            />
          );
        })}
      </div>

      <Sheet
        open={detailOpen}
        onClose={() => {
          setSelectedId(null);
        }}
      >
        {selected === null ? null : (
          <RecordDetail
            record={selected}
            onDeleted={handleDeleted}
            onUpdated={handleUpdated}
            onTagClick={(t) => {
              setActiveTag((cur) => (cur === t ? null : t));
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings section
// ---------------------------------------------------------------------------

function SettingsSection() {
  const { settings, loading, update } = useSettings();

  return (
    <div className="h-full overflow-auto px-6 py-8">
      <header className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
        <p className="mt-1 text-sm text-gray-600">Extension behavior and preferences.</p>
      </header>

      <div className="max-w-2xl space-y-4">
        <SettingsCard title="Appearance">
          <SettingRow label="Theme" description="Light, dark, or follow the system preference.">
            <select
              value={settings.theme}
              disabled={loading}
              onChange={(e) => {
                void update({ theme: (e.target as HTMLSelectElement).value as Theme });
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
            >
              <option value="auto">Auto</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Capture">
          <SettingRow
            label="Capture page screenshot"
            description="Save a JPEG snapshot of the page at save time."
          >
            <Toggle
              checked={settings.captureScreenshot}
              disabled={loading}
              onChange={(v) => {
                void update({ captureScreenshot: v });
              }}
            />
          </SettingRow>
          <SettingRow
            label="Strip tracking parameters"
            description={'Remove utm_*, fbclid, gclid, mc_eid, ref, source from the saved URL.'}
          >
            <Toggle
              checked={settings.stripTrackingParams}
              disabled={loading}
              onChange={(v) => {
                void update({ stripTrackingParams: v });
              }}
            />
          </SettingRow>
          <SettingRow
            label="Max selection length"
            description="Selections longer than this are rejected with a toast."
          >
            <input
              type="number"
              min={500}
              max={20_000}
              step={500}
              value={settings.maxSelectionChars}
              disabled={loading}
              onChange={(e) => {
                const raw = (e.target as HTMLInputElement).valueAsNumber;
                if (!Number.isFinite(raw) || raw < 500) return;
                void update({
                  maxSelectionChars: Math.min(20_000, Math.max(500, Math.trunc(raw))),
                });
              }}
              className="w-28 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
            />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Save toast">
          <SettingRow
            label="Auto-dismiss duration"
            description="How long the post-save pill stays before it fades away."
          >
            <select
              value={String(settings.toastDurationMs)}
              disabled={loading}
              onChange={(e) => {
                void update({
                  toastDurationMs: Number((e.target as HTMLSelectElement).value),
                });
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
            >
              <option value="3000">3 seconds</option>
              <option value="5000">5 seconds</option>
              <option value="10000">10 seconds</option>
              <option value="0">Never</option>
            </select>
          </SettingRow>
        </SettingsCard>

        <DataCard />

        <SettingsCard title="Keyboard shortcut">
          <div className="flex flex-wrap items-center gap-2">
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
        </SettingsCard>
      </div>
    </div>
  );
}

function DataCard() {
  const [includeScreenshots, setIncludeScreenshots] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <SettingsCard title="Data">
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
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Export'}
        </button>
      </SettingRow>
      {error === null ? null : (
        <div className="text-xs text-red-600" role="alert">
          Export failed: {error}
        </div>
      )}
    </SettingsCard>
  );
}

function SettingsCard({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gray-500">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ComponentChildren;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description ? <div className="mt-0.5 text-xs text-gray-500">{description}</div> : null}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => {
        onChange(!checked);
      }}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-stone-900' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function App() {
  const [section, setSection] = useState<Section>('library');
  const { settings } = useSettings();

  // Apply the theme as a data attribute on <html>. Actual dark-mode
  // styling is deferred to MARK-38 — this just ensures the choice is
  // observable in the DOM and survives reloads.
  useEffect(() => {
    const html = document.documentElement;
    if (settings.theme === 'auto') {
      delete html.dataset['theme'];
    } else {
      html.dataset['theme'] = settings.theme;
    }
  }, [settings.theme]);

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
