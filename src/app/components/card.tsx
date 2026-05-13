import type { ComponentChildren } from 'preact';

import { formatRelative } from '../../lib/time.js';
import { hostnameOf } from '../../lib/url.js';
import type { Record } from '../../shared/types.js';
import { splitForCard, wordCount } from '../lib/card-text.js';

import { ArchivedPill } from './archived-pill.js';
import { Favicon } from './favicon.js';
import { TagChip } from './tag-chip.js';

/**
 * Muted ellipsis used to indicate "more before" / "more after" on a
 * card's title and excerpt. Different color from the body text so the
 * reader registers it as a UI cue, not part of the content.
 */
function MoreEllipsis() {
  return <span className="text-stone-400 dark:text-stone-500">…</span>;
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
export function Card({ record, isSelected, archived, activeTag, onClick, onTagClick }: CardProps) {
  const dateIso =
    archived && record.archivedAt !== undefined ? record.archivedAt : record.createdAt;
  const stripe = record.type === 'selection' ? 'bg-blue-400' : 'bg-emerald-400';
  const surface = isSelected
    ? 'bg-amber-100 shadow-md dark:bg-amber-900/30'
    : 'bg-amber-50/70 hover:-translate-y-0.5 hover:bg-amber-100/60 hover:shadow-md dark:bg-stone-800/60 dark:hover:bg-stone-800';

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
          className="min-w-0 flex-1 truncate text-xs text-stone-600 dark:text-stone-400 dark:text-stone-500"
          title={
            record.pageTitle
              ? `${hostnameOf(record.sourceUrl)} | ${record.pageTitle}`
              : record.sourceUrl
          }
        >
          <span className="font-medium">{hostnameOf(record.sourceUrl)}</span>
          {record.pageTitle ? (
            <>
              <span className="px-1 text-stone-400 dark:text-stone-500">|</span>
              <span>{record.pageTitle}</span>
            </>
          ) : null}
        </span>
      </header>

      <h3 className="mt-4 line-clamp-2 text-[17px] font-extrabold leading-tight text-stone-900 dark:text-stone-100">
        {renderCardTitle(record.type, split.first, split.rest.length > 0)}
      </h3>

      {split.rest.length > 0 ? (
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
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

      <footer className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs font-medium text-stone-600 dark:text-stone-400 dark:text-stone-500">
        <span className="flex items-center gap-2">
          {record.type === 'selection' ? (
            <span>Selection: {wordCount(record.selectedText)} words</span>
          ) : (
            <span>Page</span>
          )}
          {archived ? <ArchivedPill /> : null}
        </span>
        <span className="text-stone-500 dark:text-stone-500">{formatRelative(dateIso)}</span>
      </footer>
    </article>
  );
}
