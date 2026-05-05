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

function App() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  const subtitle =
    error !== null
      ? `Couldn't connect: ${error}`
      : snippets === null
        ? 'Loading…'
        : query.trim() === ''
          ? `${String(snippets.length)} ${snippets.length === 1 ? 'snippet' : 'snippets'} saved.`
          : `${String(filtered.length)} of ${String(snippets.length)} shown.`;

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 font-sans">
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

      <ul className="space-y-2">
        {filtered.map((s) => (
          <li
            key={s.id}
            className="cursor-pointer rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            <p className="line-clamp-3 text-sm leading-relaxed text-gray-900">{s.selectedText}</p>
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
                {s.pageTitle ? <span className="ml-1 text-gray-500">· {s.pageTitle}</span> : null}
              </a>
              <span className="flex-shrink-0 whitespace-nowrap">
                {formatRelative(s.createdAt)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
