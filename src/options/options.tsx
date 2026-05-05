import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';

import { formatRelative } from '../lib/time.js';
import { send } from '../shared/send.js';
import type { Snippet } from '../shared/types.js';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function SnippetDetail({ snippet, onClose }: { snippet: Snippet; onClose: () => void }) {
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="flex-shrink-0 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          ×
        </button>
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

        {snippet.contextBefore || snippet.contextAfter ? (
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

        {snippet.screenshotDataUrl ? (
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

        {snippet.iframeUrl ? (
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

function App() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    send({ type: 'snippet:list' })
      .then((items) => {
        setSnippets(items);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
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
    <main className="mx-auto max-w-7xl px-6 py-8 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">mark-my-words</h1>
        <p className="mt-1 text-sm text-gray-600">{subtitle}</p>
      </header>

      <div className="mb-4">
        <input
          type="search"
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
          }}
          placeholder="Filter snippets…"
          aria-label="Filter snippets"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>

      {snippets !== null && snippets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm text-gray-700">No snippets yet.</p>
          <p className="mt-1 text-xs text-gray-500">
            Right-click selected text on any page → &quot;Save selection as snippet&quot;.
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
                onClick={() => {
                  setSelectedId(isSelected ? null : s.id);
                }}
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
          style={{ maxHeight: 'calc(100vh - 2rem)' }}
        >
          {selected !== null ? (
            <SnippetDetail
              snippet={selected}
              onClose={() => {
                setSelectedId(null);
              }}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
