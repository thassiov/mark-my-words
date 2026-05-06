import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { formatRelative } from '../lib/time.js';
import { isSnippetEvent } from '../shared/messages.js';
import { send } from '../shared/send.js';
import type { Snippet } from '../shared/types.js';

type Section = 'library' | 'settings';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Detail pane
// ---------------------------------------------------------------------------

interface DetailProps {
  snippet: Snippet;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onUpdated: (snippet: Snippet) => void;
}

function SnippetDetail({ snippet, onClose, onDeleted, onUpdated }: DetailProps) {
  const [editing, setEditing] = useState(false);
  const [editNote, setEditNote] = useState(snippet.note ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setEditing(false);
    setEditNote(snippet.note ?? '');
  }, [snippet.id]);

  async function handleSave() {
    setSaving(true);
    try {
      // Cast: send()'s conditional return type doesn't narrow through
      // the generic, so we assert the concrete shape here.
      const updated = (await send({
        type: 'snippet:update',
        payload: {
          id: snippet.id,
          edit: { note: editNote.trim() || undefined },
        },
      })) as Snippet;
      onUpdated(updated);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this snippet?')) return;
    setDeleting(true);
    try {
      await send({ type: 'snippet:delete', payload: { id: snippet.id } });
      onDeleted(snippet.id);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <aside className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white">
      <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
        <div className="min-w-0">
          <a
            href={snippet.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm font-medium text-blue-600 hover:underline"
            title={snippet.sourceUrl}
          >
            {hostnameOf(snippet.sourceUrl)}
          </a>
          {snippet.pageTitle ? (
            <p className="mt-0.5 truncate text-xs text-gray-500" title={snippet.pageTitle}>
              {snippet.pageTitle}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-gray-400">{formatRelative(snippet.createdAt)}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          {!editing ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
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
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Selection
          </h2>
          <blockquote className="border-l-4 border-blue-200 bg-blue-50/50 px-3 py-2 text-sm leading-relaxed text-gray-900">
            {snippet.selectedText}
          </blockquote>
        </section>

        {editing ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Note
            </h2>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              rows={3}
              placeholder="Add a personal note…"
              value={editNote}
              onInput={(e) => setEditNote((e.target as HTMLTextAreaElement).value)}
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setEditNote(snippet.note ?? '');
                }}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </section>
        ) : null}

        {!editing && snippet.note ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Note
            </h2>
            <p className="text-sm leading-relaxed text-gray-700">{snippet.note}</p>
          </section>
        ) : null}

        {!editing && (snippet.contextBefore || snippet.contextAfter) ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              In context
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              <span className="text-gray-400">{snippet.contextBefore}</span>
              <mark className="bg-yellow-200 px-0.5 text-gray-900">{snippet.selectedText}</mark>
              <span className="text-gray-400">{snippet.contextAfter}</span>
            </p>
          </section>
        ) : null}

        {!editing && snippet.screenshotDataUrl ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Screenshot
            </h2>
            <img
              src={snippet.screenshotDataUrl}
              alt="Page at the moment of capture"
              className="w-full rounded-md border border-gray-200"
            />
          </section>
        ) : null}

        {!editing && snippet.iframeUrl ? (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Iframe source
            </h2>
            <a
              href={snippet.iframeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="break-all text-xs text-blue-600 hover:underline"
            >
              {snippet.iframeUrl}
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

function LibrarySection() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    // Support deep-link via URL hash: options.html#<snippet-id>
    const hash = location.hash.slice(1);
    return hash || null;
  });

  useEffect(() => {
    send({ type: 'snippet:list' })
      .then((items) => setSnippets(items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Reactivity: patch local state when the SW broadcasts a mutation event.
  useEffect(() => {
    function handleEvent(msg: unknown) {
      if (!isSnippetEvent(msg)) return;
      if (msg.type === 'snippet:created') {
        setSnippets((prev) => (prev === null ? [msg.snippet] : [msg.snippet, ...prev]));
      } else if (msg.type === 'snippet:deleted') {
        setSnippets((prev) => prev?.filter((s) => s.id !== msg.id) ?? null);
        setSelectedId((id) => (id === msg.id ? null : id));
      } else if (msg.type === 'snippet:updated') {
        setSnippets((prev) => prev?.map((s) => (s.id === msg.snippet.id ? msg.snippet : s)) ?? null);
      }
    }
    chrome.runtime.onMessage.addListener(handleEvent);
    return () => {
      chrome.runtime.onMessage.removeListener(handleEvent);
    };
  }, []);

  const filtered = useMemo(() => {
    if (snippets === null) return [];
    const q = query.trim().toLowerCase();
    if (q === '') return snippets;
    return snippets.filter(
      (s) =>
        s.selectedText.toLowerCase().includes(q) ||
        s.pageTitle.toLowerCase().includes(q) ||
        hostnameOf(s.sourceUrl).toLowerCase().includes(q),
    );
  }, [snippets, query]);

  const selected = useMemo(
    () => (selectedId === null ? null : (snippets?.find((s) => s.id === selectedId) ?? null)),
    [snippets, selectedId],
  );

  useEffect(() => {
    if (selectedId !== null && !filtered.some((s) => s.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filtered, selectedId]);

  function handleDeleted(id: string) {
    setSnippets((prev) => prev?.filter((s) => s.id !== id) ?? null);
    setSelectedId(null);
  }

  function handleUpdated(updated: Snippet) {
    setSnippets((prev) => prev?.map((s) => (s.id === updated.id ? updated : s)) ?? null);
  }

  const detailOpen = selected !== null;

  const subtitle =
    error !== null
      ? `Couldn't connect: ${error}`
      : snippets === null
        ? 'Loading…'
        : query.trim() === ''
          ? `${String(snippets.length)} ${snippets.length === 1 ? 'snippet' : 'snippets'} saved.`
          : `${String(filtered.length)} of ${String(snippets.length)} shown.`;

  return (
    <div className="h-full overflow-auto px-6 py-8">
      <header className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight">Library</h2>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </header>

      <div className="mb-4">
        <input
          type="search"
          value={query}
          onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
          placeholder="Filter snippets…"
          aria-label="Filter snippets"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {snippets !== null && snippets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-700">No snippets yet.</p>
          <p className="mt-1 text-xs text-gray-500">
            Select text on any page and press Ctrl+Shift+S, or right-click → Save selection as
            snippet.
          </p>
        </div>
      ) : null}

      {snippets !== null && snippets.length > 0 && filtered.length === 0 ? (
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
                onClick={() => setSelectedId(isSelected ? null : s.id)}
                className={`cursor-pointer rounded-lg border bg-white p-4 transition-colors ${
                  isSelected
                    ? 'border-blue-400 bg-blue-50/40'
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <p className="line-clamp-3 text-sm leading-relaxed text-gray-900">
                  {s.selectedText}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-0 flex-shrink truncate text-blue-600 hover:underline"
                    title={s.sourceUrl}
                  >
                    <span className="font-medium">{hostnameOf(s.sourceUrl)}</span>
                    {s.pageTitle ? (
                      <span className="ml-1 text-gray-500">· {s.pageTitle}</span>
                    ) : null}
                  </a>
                  <span className="flex-shrink-0 whitespace-nowrap">
                    {formatRelative(s.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div
          className={`sticky top-4 overflow-hidden transition-opacity duration-300 ${
            detailOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          style={{ maxHeight: 'calc(100vh - 4rem)' }}
        >
          {selected !== null ? (
            <SnippetDetail
              snippet={selected}
              onClose={() => setSelectedId(null)}
              onDeleted={handleDeleted}
              onUpdated={handleUpdated}
            />
          ) : null}
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

  return (
    <div className="flex h-screen bg-gray-50 font-sans">
      <nav className="flex w-52 flex-shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-6">
        <h1 className="mb-8 text-base font-semibold tracking-tight text-gray-900">mark-my-words</h1>
        <ul className="space-y-1">
          {(
            [
              { id: 'library', label: 'Library' },
              { id: 'settings', label: 'Settings' },
            ] as const
          ).map(({ id, label }) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => setSection(id)}
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

      <div className="flex min-w-0 flex-1 flex-col">
        {section === 'library' ? <LibrarySection /> : <SettingsSection />}
      </div>
    </div>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
