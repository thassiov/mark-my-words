import { useState } from 'preact/hooks';

import { send } from '../../shared/send.js';
import type { Record } from '../../shared/types.js';
import { TAG_SUGGESTIONS_ID, normalizeTag } from '../lib/tag.js';

interface TagAdderProps {
  record: Record;
}

/**
 * Inline tag adder for list cards. Renders as a "+ tag" pill that turns
 * into a small input on click. Submits via `record:update`; the SW
 * broadcasts `record:updated` and the LibrarySection's listener swaps
 * the record in place.
 */
export function TagAdder({ record }: TagAdderProps) {
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
        className="inline-flex items-center rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-[11px] text-gray-500 hover:border-gray-400 hover:text-gray-700 dark:border-stone-600 dark:text-stone-400 dark:hover:border-stone-500 dark:hover:text-stone-200"
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
      className="rounded-full border border-gray-300 bg-white px-2 py-0.5 text-[11px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100"
    />
  );
}
