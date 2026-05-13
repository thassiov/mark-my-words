import { useEffect, useState } from 'preact/hooks';

import { formatRelative } from '../../lib/time.js';
import { send } from '../../shared/send.js';
import type { Note, Record } from '../../shared/types.js';

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
export function NoteSection({ record, onUpdated, textareaRef }: NoteSectionProps) {
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
        <NoteEditForm
          draft={draft}
          busy={busy}
          onDraftChange={setDraft}
          onSave={() => {
            void handleSave();
          }}
          onCancel={() => {
            setDraft(note.text);
            setEditing(false);
          }}
        />
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-800">
          {note.text}
        </p>
      )}
    </li>
  );
}

interface NoteEditFormProps {
  draft: string;
  busy: boolean;
  onDraftChange: (next: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

/** Inline textarea + Save/Cancel buttons used when a note is in edit mode. */
function NoteEditForm({ draft, busy, onDraftChange, onSave, onCancel }: NoteEditFormProps) {
  return (
    <>
      <textarea
        value={draft}
        onInput={(e) => {
          onDraftChange((e.target as HTMLTextAreaElement).value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSave();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        rows={3}
        className="mt-2 w-full resize-none rounded-md border border-stone-300 bg-white px-3 py-2 text-sm leading-relaxed text-stone-900 focus:border-stone-500 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
        autoFocus
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-700 transition-colors hover:bg-stone-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={busy || draft.trim().length === 0}
          className="rounded-md bg-stone-900 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </>
  );
}
