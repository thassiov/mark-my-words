import { formatRelative } from '../lib/time.js';
import { hostnameOf } from '../lib/url.js';
import type { Record } from '../shared/types.js';

import { listStyle, itemStyle, textStyle, metaStyle, linkStyle, tsStyle } from './styles.js';

export function RecordList({ records }: { records: Record[] }) {
  return (
    <ul style={listStyle}>
      {records.map((r) => (
        <RecordItem key={r.id} record={r} />
      ))}
    </ul>
  );
}

function RecordItem({ record }: { record: Record }) {
  // Pages have no selectedText; show the title in its place so the
  // popup row doesn't collapse to nothing.
  const primaryText = record.type === 'selection' ? record.selectedText : record.pageTitle;
  return (
    <li style={itemStyle}>
      <p style={textStyle}>{primaryText}</p>
      <div style={metaStyle}>
        <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" style={linkStyle}>
          {hostnameOf(record.sourceUrl)}
        </a>
        <span style={tsStyle}>{formatRelative(record.createdAt)}</span>
      </div>
    </li>
  );
}
