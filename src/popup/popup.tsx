import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { send } from '../shared/send.js';
import type { Snippet } from '../shared/types.js';

import { SnippetList } from './snippet-list.js';
import {
  countStyle,
  emptyHintStyle,
  emptyStyle,
  errorStyle,
  headerStyle,
  loadingStyle,
  mainStyle,
  titleStyle,
} from './styles.js';

function App() {
  const [snippets, setSnippets] = useState<Snippet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    send({ type: 'snippet:list' })
      .then((items) => {
        if (!cancelled) setSnippets(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let body;
  if (error !== null) {
    body = <p style={errorStyle}>Couldn&apos;t load snippets: {error}</p>;
  } else if (snippets === null) {
    body = <p style={loadingStyle}>Loading…</p>;
  } else if (snippets.length === 0) {
    body = (
      <div>
        <p style={emptyStyle}>No snippets yet.</p>
        <p style={emptyHintStyle}>Highlight text on any page and press Ctrl+Shift+S.</p>
      </div>
    );
  } else {
    body = <SnippetList snippets={snippets} />;
  }

  return (
    <main style={mainStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>mark-my-words</h1>
        {snippets !== null && snippets.length > 0 ? (
          <span style={countStyle}>
            {snippets.length} {snippets.length === 1 ? 'snippet' : 'snippets'}
          </span>
        ) : null}
      </header>
      {body}
    </main>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
