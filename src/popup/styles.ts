import type { JSX } from 'preact';

type Style = JSX.CSSProperties;

export const mainStyle: Style = {
  fontFamily: 'system-ui, -apple-system, sans-serif',
  width: '360px',
  padding: '12px',
  margin: 0,
  color: '#222',
  background: '#fff',
};

export const headerStyle: Style = {
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: '8px',
  marginBottom: '12px',
};

export const titleStyle: Style = {
  fontSize: '14px',
  fontWeight: 600,
  margin: 0,
};

export const countStyle: Style = {
  fontSize: '12px',
  color: '#666',
};

export const loadingStyle: Style = {
  fontSize: '12px',
  color: '#666',
  margin: 0,
};

export const errorStyle: Style = {
  fontSize: '12px',
  color: '#b91c1c',
  margin: 0,
};

export const emptyStyle: Style = {
  fontSize: '13px',
  color: '#444',
  padding: '8px 0',
  margin: 0,
};

export const emptyHintStyle: Style = {
  fontSize: '12px',
  color: '#888',
  margin: '4px 0 0',
};

export const listStyle: Style = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
};

export const itemStyle: Style = {
  padding: '8px 10px',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  background: '#fafafa',
};

export const textStyle: Style = {
  margin: 0,
  fontSize: '13px',
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  wordBreak: 'break-word',
};

export const metaStyle: Style = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '6px',
  fontSize: '11px',
  gap: '8px',
};

export const linkStyle: Style = {
  color: '#2563eb',
  textDecoration: 'none',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  flexShrink: 1,
  minWidth: 0,
};

export const tsStyle: Style = {
  color: '#888',
  flexShrink: 0,
};
