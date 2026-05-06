import { describe, expect, it } from 'vitest';

import { isMessage } from './messages.js';
import type { SnippetInput } from './types.js';

const baseInput: SnippetInput = {
  selectedText: 'hello',
  contextBefore: '',
  contextAfter: '',
  sourceUrl: 'https://example.com',
  pageTitle: 'Example',
};

describe('isMessage', () => {
  it('accepts known types', () => {
    expect(isMessage({ type: 'snippet:save', payload: baseInput })).toBe(true);
    expect(isMessage({ type: 'snippet:list' })).toBe(true);
    expect(isMessage({ type: 'snippet:count' })).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(isMessage({ type: 'snippet:nope' })).toBe(false);
    expect(isMessage({ type: '' })).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage(undefined)).toBe(false);
    expect(isMessage('snippet:save')).toBe(false);
    expect(isMessage(42)).toBe(false);
    expect(isMessage({})).toBe(false);
    expect(isMessage({ payload: baseInput })).toBe(false);
  });
});
