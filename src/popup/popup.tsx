import { render } from 'preact';

function App() {
  return (
    <main style={{ padding: '12px', fontFamily: 'system-ui, sans-serif', minWidth: '280px' }}>
      <h1 style={{ fontSize: '14px', margin: 0 }}>mark-my-words</h1>
      <p style={{ fontSize: '12px', margin: '4px 0 0', color: '#666' }}>
        Snippet list will appear here.
      </p>
    </main>
  );
}

const root = document.querySelector('#root');
if (root) {
  render(<App />, root);
}
