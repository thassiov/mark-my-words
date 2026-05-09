import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

import { errorMessage } from '../lib/error.js';
import { send } from '../shared/send.js';
import type { Record } from '../shared/types.js';

import { RecordList } from './record-list.js';
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
  const [records, setRecords] = useState<Record[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    send({ type: 'record:list' })
      .then((items) => {
        if (!cancelled) setRecords(items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(errorMessage(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  let body;
  if (error !== null) {
    body = <p style={errorStyle}>Couldn&apos;t load records: {error}</p>;
  } else if (records === null) {
    body = <p style={loadingStyle}>Loading…</p>;
  } else if (records.length === 0) {
    body = (
      <div>
        <p style={emptyStyle}>No records yet.</p>
        <p style={emptyHintStyle}>Highlight text on any page and press Ctrl+Shift+S.</p>
      </div>
    );
  } else {
    body = <RecordList records={records} />;
  }

  return (
    <main style={mainStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>mark-my-words</h1>
        {records !== null && records.length > 0 ? (
          <span style={countStyle}>
            {records.length} {records.length === 1 ? 'record' : 'records'}
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
