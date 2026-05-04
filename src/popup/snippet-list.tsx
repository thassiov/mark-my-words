import { formatRelative } from '../lib/time.js';
import type { Snippet } from '../shared/types.js';

import { listStyle, itemStyle, textStyle, metaStyle, linkStyle, tsStyle } from './styles.js';

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function SnippetList({ snippets }: { snippets: Snippet[] }) {
  return (
    <ul style={listStyle}>
      {snippets.map((s) => (
        <SnippetItem key={s.id} snippet={s} />
      ))}
    </ul>
  );
}

function SnippetItem({ snippet }: { snippet: Snippet }) {
  return (
    <li style={itemStyle}>
      <p style={textStyle}>{snippet.selectedText}</p>
      <div style={metaStyle}>
        <a href={snippet.sourceUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {hostnameOf(snippet.sourceUrl)}
        </a>
        <span style={tsStyle}>{formatRelative(snippet.createdAt)}</span>
      </div>
    </li>
  );
}
