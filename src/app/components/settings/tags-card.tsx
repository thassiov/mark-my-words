import { useEffect, useState } from 'preact/hooks';

import { errorMessage } from '../../../lib/error.js';
import { isRecordEvent } from '../../../shared/messages.js';
import { send } from '../../../shared/send.js';
import { TagChip } from '../tag-chip.js';

import { SettingsCard } from './settings-primitives.js';

/**
 * Tag manager. Lists every tag in use across the library and exposes
 * rename / merge / delete actions. The dispatcher fans out one
 * `record:updated` event per touched record, so LibrarySection stays in
 * sync; here we just refetch the tag list after any successful op.
 *
 * Per-tag color is not yet supported — chips render with the same
 * deterministic HSL hue as everywhere else in the app. Tracked as a
 * follow-up to MARK-45.
 */
export function TagsCard() {
  const [tags, setTags] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ tag: string; mode: 'rename' | 'merge' } | null>(null);

  const reload = () => {
    setLoadError(null);
    send({ type: 'tag:list' })
      .then((next) => {
        setTags(next);
      })
      .catch((err: unknown) => {
        setLoadError(errorMessage(err));
      });
  };

  useEffect(() => {
    reload();
  }, []);

  // Keep the list fresh when records change elsewhere (e.g. user adds a
  // new tag via the +tag pill on a card). Cheap: ~1 chrome.runtime
  // message handler.
  useEffect(() => {
    function onMessage(msg: unknown) {
      if (isRecordEvent(msg)) reload();
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  return (
    <SettingsCard title="Tags">
      {loadError === null ? null : (
        <div className="text-xs text-red-600 dark:text-red-400" role="alert">
          Couldn't load tags: {loadError}
        </div>
      )}
      <TagsList
        tags={tags}
        editing={editing}
        onOpen={(tag, mode) => {
          setEditing({ tag, mode });
        }}
        onClose={() => {
          setEditing(null);
        }}
        onDone={() => {
          setEditing(null);
          reload();
        }}
      />
    </SettingsCard>
  );
}

interface TagsListProps {
  tags: string[] | null;
  editing: { tag: string; mode: 'rename' | 'merge' } | null;
  onOpen: (tag: string, mode: 'rename' | 'merge') => void;
  onClose: () => void;
  onDone: () => void;
}

function TagsList({ tags, editing, onOpen, onClose, onDone }: TagsListProps) {
  if (tags === null) {
    return <p className="text-sm text-gray-500 dark:text-stone-400">Loading…</p>;
  }
  if (tags.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-stone-400">
        No tags yet. Add tags from any record's detail pane.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {tags.map((tag) => (
        <TagRow
          key={tag}
          tag={tag}
          allTags={tags}
          editing={editing?.tag === tag ? editing.mode : null}
          onOpenEdit={(mode) => {
            onOpen(tag, mode);
          }}
          onClose={onClose}
          onDone={onDone}
        />
      ))}
    </ul>
  );
}

interface TagRowProps {
  tag: string;
  allTags: readonly string[];
  editing: 'rename' | 'merge' | null;
  onOpenEdit: (mode: 'rename' | 'merge') => void;
  onClose: () => void;
  onDone: () => void;
}

function TagRow({ tag, allTags, editing, onOpenEdit, onClose, onDone }: TagRowProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runDelete() {
    if (!globalThis.confirm(`Remove tag "${tag}" from every record?`)) return;
    setBusy(true);
    setError(null);
    try {
      await send({ type: 'tag:delete', payload: { name: tag } });
      onDone();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-gray-200 bg-white px-3 py-2 dark:border-stone-800 dark:bg-stone-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TagChip tag={tag} />
        <div className="flex flex-wrap items-center gap-1">
          <RowButton
            onClick={() => {
              onOpenEdit('rename');
            }}
            disabled={busy}
          >
            Rename
          </RowButton>
          <RowButton
            onClick={() => {
              onOpenEdit('merge');
            }}
            disabled={busy || allTags.length < 2}
          >
            Merge
          </RowButton>
          <RowButton
            onClick={() => {
              void runDelete();
            }}
            disabled={busy}
            variant="danger"
          >
            Delete
          </RowButton>
        </div>
      </div>
      {editing === 'rename' ? (
        <RenameForm tag={tag} onCancel={onClose} onDone={onDone} setError={setError} />
      ) : null}
      {editing === 'merge' ? (
        <MergeForm
          tag={tag}
          allTags={allTags}
          onCancel={onClose}
          onDone={onDone}
          setError={setError}
        />
      ) : null}
      {error === null ? null : (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </div>
      )}
    </li>
  );
}

interface RowButtonProps {
  onClick: () => void;
  disabled?: boolean;
  variant?: 'default' | 'danger';
  children: string;
}

function RowButton({ onClick, disabled, variant = 'default', children }: RowButtonProps) {
  const tone =
    variant === 'danger'
      ? 'text-red-700 hover:bg-red-700 hover:text-white dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white'
      : 'text-stone-700 hover:bg-stone-900 hover:text-white dark:text-stone-300 dark:hover:bg-stone-200 dark:hover:text-stone-900';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tone}`}
    >
      {children}
    </button>
  );
}

interface RenameFormProps {
  tag: string;
  onCancel: () => void;
  onDone: () => void;
  setError: (msg: string | null) => void;
}

function RenameForm({ tag, onCancel, onDone, setError }: RenameFormProps) {
  const [value, setValue] = useState(tag);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const next = value.trim().toLowerCase();
    if (next.length === 0 || next === tag) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send({ type: 'tag:rename', payload: { from: tag, to: next } });
      onDone();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        autoFocus
        value={value}
        disabled={busy}
        onInput={(e) => {
          setValue((e.target as HTMLInputElement).value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      />
      <RowButton
        onClick={() => {
          void submit();
        }}
        disabled={busy}
      >
        Save
      </RowButton>
      <RowButton onClick={onCancel} disabled={busy}>
        Cancel
      </RowButton>
    </div>
  );
}

interface MergeFormProps {
  tag: string;
  allTags: readonly string[];
  onCancel: () => void;
  onDone: () => void;
  setError: (msg: string | null) => void;
}

function MergeForm({ tag, allTags, onCancel, onDone, setError }: MergeFormProps) {
  const candidates = allTags.filter((t) => t !== tag);
  const [target, setTarget] = useState(candidates[0] ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (target === '' || target === tag) {
      onCancel();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await send({ type: 'tag:merge', payload: { from: tag, into: target } });
      onDone();
    } catch (err: unknown) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-xs text-gray-500 dark:text-stone-400">Merge into</span>
      <select
        value={target}
        disabled={busy}
        onChange={(e) => {
          setTarget((e.target as HTMLSelectElement).value);
        }}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
      >
        {candidates.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <RowButton
        onClick={() => {
          void submit();
        }}
        disabled={busy}
      >
        Merge
      </RowButton>
      <RowButton onClick={onCancel} disabled={busy}>
        Cancel
      </RowButton>
    </div>
  );
}
