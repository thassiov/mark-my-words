import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

import { hostnameOf } from '../../lib/url.js';
import type { Record } from '../../shared/types.js';
import { useRecordsForView } from '../hooks/use-records-for-view.js';
import { buildSubtitle } from '../lib/subtitle.js';
import { TAG_SUGGESTIONS_ID } from '../lib/tag.js';

import { ArchivedPill } from './archived-pill.js';
import { Card } from './card.js';
import { RecordDetail } from './record-detail.js';
import { Sheet } from './sheet.js';
import { TagChip } from './tag-chip.js';

interface LibrarySectionProps {
  /** When true, render the archived list instead of the active list. */
  archived: boolean;
}

export function LibrarySection({ archived }: LibrarySectionProps) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // Support deep-link via URL hash: app.html#<record-id>
    const hash = location.hash.slice(1);
    return hash || null;
  });

  const clearSelectionIfMatches = useCallback((id: string) => {
    setSelectedId((current) => (current === id ? null : current));
  }, []);

  const { records, error, removeFromState, patchInState } = useRecordsForView(
    archived,
    clearSelectionIfMatches,
  );

  const allTags = useMemo(() => {
    if (records === null) return [] as string[];
    const set = new Set<string>();
    for (const s of records) for (const t of s.tags ?? []) set.add(t);
    return [...set].toSorted();
  }, [records]);

  // If the active tag disappears (e.g. last record carrying it migrated
  // to the other view), clear it.
  useEffect(() => {
    if (activeTag !== null && !allTags.includes(activeTag)) setActiveTag(null);
  }, [activeTag, allTags]);

  const filtered = useMemo(
    () => filterRecords(records, query, activeTag),
    [records, query, activeTag],
  );

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

  const subtitle = buildSubtitle({
    error,
    records,
    filteredLength: filtered.length,
    query,
    noun: archived ? 'archived record' : 'record',
  });
  const heading = archived ? 'Archived' : 'Library';

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

      <LibraryToolbar
        archived={archived}
        query={query}
        onQueryChange={setQuery}
        activeTag={activeTag}
        onClearActiveTag={() => {
          setActiveTag(null);
        }}
      />

      <LibraryListBody
        archived={archived}
        records={records}
        filtered={filtered}
        query={query}
        selectedId={selectedId}
        activeTag={activeTag}
        onSelect={setSelectedId}
        onActivateTag={setActiveTag}
      />

      <Sheet
        open={selected !== null}
        onClose={() => {
          setSelectedId(null);
        }}
      >
        {selected === null ? null : (
          <RecordDetail
            record={selected}
            onDeleted={(id) => {
              removeFromState(id);
              setSelectedId(null);
            }}
            onUpdated={patchInState}
            onTagClick={(t) => {
              setActiveTag((cur) => (cur === t ? null : t));
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

function filterRecords(
  records: Record[] | null,
  query: string,
  activeTag: string | null,
): Record[] {
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
}

interface LibraryToolbarProps {
  archived: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  activeTag: string | null;
  onClearActiveTag: () => void;
}

function LibraryToolbar({
  archived,
  query,
  onQueryChange,
  activeTag,
  onClearActiveTag,
}: LibraryToolbarProps) {
  return (
    <div className="mb-4">
      <input
        type="search"
        value={query}
        onInput={(e) => {
          onQueryChange((e.target as HTMLInputElement).value);
        }}
        placeholder={archived ? 'Filter archived…' : 'Filter records…'}
        aria-label="Filter records"
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
      />
      {activeTag === null ? null : (
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
          <span>Filtering by</span>
          <TagChip tag={activeTag} active onRemove={onClearActiveTag} />
        </div>
      )}
    </div>
  );
}

interface LibraryListBodyProps {
  archived: boolean;
  records: Record[] | null;
  filtered: Record[];
  query: string;
  selectedId: string | null;
  activeTag: string | null;
  onSelect: (id: string | null) => void;
  onActivateTag: (t: string | null) => void;
}

function LibraryListBody({
  archived,
  records,
  filtered,
  query,
  selectedId,
  activeTag,
  onSelect,
  onActivateTag,
}: LibraryListBodyProps) {
  if (records !== null && records.length === 0) {
    return <EmptyState archived={archived} />;
  }
  return (
    <>
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
                onSelect(isSelected ? null : s.id);
              }}
              onTagClick={(t) => {
                onActivateTag(t === activeTag ? null : t);
              }}
            />
          );
        })}
      </div>
    </>
  );
}

function EmptyState({ archived }: { archived: boolean }) {
  return (
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
  );
}
