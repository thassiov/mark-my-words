import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { send } from '../shared/send.js';

function App() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    send({ type: 'snippet:count' })
      .then((n) => {
        setCount(n);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8 font-sans">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">mark-my-words</h1>
        <p className="mt-1 text-sm text-gray-600">
          {error !== null
            ? `Couldn't connect: ${error}`
            : count === null
              ? 'Loading…'
              : `${String(count)} snippet${count === 1 ? '' : 's'} saved.`}
        </p>
      </header>
      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <p className="text-sm text-gray-600">
          List + detail pane land in the next tasks. For now this page just confirms the options
          surface is wired up.
        </p>
      </section>
    </main>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
