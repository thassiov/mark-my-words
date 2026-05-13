import { useRef, useState } from 'preact/hooks';

import { send } from '../../shared/send.js';
import type { Record } from '../../shared/types.js';

import { Collapsible } from './collapsible.js';
import { DetailHeader } from './detail-header.js';
import { NoteSection } from './note-section.js';

interface DetailProps {
  record: Record;
  onDeleted: (id: string) => void;
  onUpdated: (record: Record) => void;
  onTagClick: (tag: string) => void;
}

export function RecordDetail({ record, onDeleted, onUpdated, onTagClick }: DetailProps) {
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const isArchived = record.archivedAt !== undefined;

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
      <DetailHeader
        record={record}
        archiving={archiving}
        deleting={deleting}
        onTagClick={onTagClick}
        onEdit={focusNoteEditor}
        onArchiveToggle={() => {
          void handleArchiveToggle();
        }}
        onDelete={() => {
          void handleDelete();
        }}
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto bg-stone-50 px-6 py-6 dark:bg-stone-950">
        {record.type === 'selection' ? (
          <blockquote className="rounded-xl bg-white px-6 py-5 font-serif text-[19px] leading-relaxed text-stone-900 shadow-sm ring-1 ring-stone-200/70 dark:bg-stone-900 dark:text-stone-100 dark:ring-stone-700/70">
            “{record.selectedText}”
          </blockquote>
        ) : null}

        {record.type === 'selection' && (record.contextBefore || record.contextAfter) ? (
          <Collapsible label="In context">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-700 dark:text-stone-300">
              <span className="text-stone-400 dark:text-stone-500">{record.contextBefore}</span>
              <mark className="bg-yellow-200 px-0.5 text-stone-900 dark:bg-yellow-700/40 dark:text-stone-100">
                {record.selectedText}
              </mark>
              <span className="text-stone-400 dark:text-stone-500">{record.contextAfter}</span>
            </p>
          </Collapsible>
        ) : null}

        {record.screenshotDataUrl ? (
          <Collapsible label="Screenshot">
            <img
              src={record.screenshotDataUrl}
              alt="Page at the moment of capture"
              className="w-full rounded-md border border-stone-200 dark:border-stone-700"
            />
          </Collapsible>
        ) : null}

        {record.iframeUrl ? (
          <Collapsible label="Iframe source">
            <a
              href={record.iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              {record.iframeUrl}
            </a>
          </Collapsible>
        ) : null}

        <NoteSection record={record} onUpdated={onUpdated} textareaRef={noteRef} />
      </div>
    </aside>
  );
}
