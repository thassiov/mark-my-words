import { describe, expect, it } from 'vitest';

import { isMessage } from './messages.js';
import type { SelectionInput } from './types.js';

const baseInput: SelectionInput = {
  selectedText: 'hello',
  contextBefore: '',
  contextAfter: '',
  sourceUrl: 'https://example.com',
  pageTitle: 'Example',
};

describe('isMessage', () => {
  it('accepts known types', () => {
    expect(isMessage({ type: 'record:save-selection', payload: baseInput })).toBe(true);
    expect(
      isMessage({
        type: 'record:save-page',
        payload: { sourceUrl: 'https://example.com', pageTitle: 'Example' },
      }),
    ).toBe(true);
    expect(isMessage({ type: 'record:list' })).toBe(true);
    expect(isMessage({ type: 'record:count' })).toBe(true);
  });

  it('rejects unknown types', () => {
    expect(isMessage({ type: 'record:nope' })).toBe(false);
    expect(isMessage({ type: 'snippet:save' })).toBe(false);
    expect(isMessage({ type: '' })).toBe(false);
  });

  it('rejects malformed values', () => {
    expect(isMessage(null)).toBe(false);
    expect(isMessage(undefined)).toBe(false);
    expect(isMessage('record:save-selection')).toBe(false);
    expect(isMessage(42)).toBe(false);
    expect(isMessage({})).toBe(false);
    expect(isMessage({ payload: baseInput })).toBe(false);
  });
});
