import { formatRelative } from '../../lib/time.js';
import { hostnameOf } from '../../lib/url.js';
import { send } from '../../shared/send.js';
import type { Record } from '../../shared/types.js';
import { wordCount } from '../lib/card-text.js';
import { archiveLabel } from '../lib/subtitle.js';

import { ArchivedPill } from './archived-pill.js';
import { Favicon } from './favicon.js';
import { TagAdder } from './tag-adder.js';
import { TagChip } from './tag-chip.js';

interface DetailHeaderProps {
  record: Record;
  archiving: boolean;
  deleting: boolean;
  onTagClick: (tag: string) => void;
  onEdit: () => void;
  onArchiveToggle: () => void;
  onDelete: () => void;
}

/**
 * Sticky top section of the record-detail panel: source link + favicon,
 * type/date row, tag row (with `+tag` adder), and the Edit/Archive/Delete
 * action buttons. Pure presentation — owns no state; takes handlers from
 * `RecordDetail`.
 */
export function DetailHeader({
  record,
  archiving,
  deleting,
  onTagClick,
  onEdit,
  onArchiveToggle,
  onDelete,
}: DetailHeaderProps) {
  const archivedAt = record.archivedAt;
  const isArchived = archivedAt !== undefined;
  const tags = record.tags ?? [];

  return (
    <header className="space-y-3 border-b border-stone-200 px-6 py-5">
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

      <div className="flex items-center gap-2 pt-2">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-700 hover:text-white"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onArchiveToggle}
          disabled={archiving}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-stone-700 transition-colors hover:bg-stone-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {archiveLabel(archiving, isArchived)}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-red-700 transition-colors hover:bg-red-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleting ? '…' : 'Delete'}
        </button>
      </div>
    </header>
  );
}
