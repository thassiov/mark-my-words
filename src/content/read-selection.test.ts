import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readSelectionInPage } from './read-selection.js';

describe('readSelectionInPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Test page';
    window.getSelection()?.removeAllRanges();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    window.getSelection()?.removeAllRanges();
  });

  function selectRangeIn(node: Text, start: number, end: number) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  it('returns null when nothing is selected', () => {
    document.body.innerHTML = '<p>Some content</p>';
    expect(readSelectionInPage()).toBeNull();
  });

  it('returns null when the selection is whitespace only', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('     ');
    p.appendChild(text);
    document.body.appendChild(p);
    selectRangeIn(text, 0, 5);
    expect(readSelectionInPage()).toBeNull();
  });

  it('captures the selected text and surrounding context', () => {
    const p = document.createElement('p');
    const longText =
      'The quick brown fox jumps over the lazy dog. ' +
      'It was a bright cold day in April, and the clocks were striking thirteen.';
    const text = document.createTextNode(longText);
    p.appendChild(text);
    document.body.appendChild(p);

    // Select "It was a bright cold day in April"
    const start = longText.indexOf('It was');
    const end = start + 'It was a bright cold day in April'.length;
    selectRangeIn(text, start, end);

    const result = readSelectionInPage();
    expect(result).not.toBeNull();
    expect(result?.selectedText).toBe('It was a bright cold day in April');
    expect(result?.contextBefore).toBe('The quick brown fox jumps over the lazy dog. ');
    expect(result?.contextAfter).toBe(', and the clocks were striking thirteen.');
  });

  it('caps context at 200 chars on each side', () => {
    const before = 'A'.repeat(500);
    const sel = 'TARGET';
    const after = 'B'.repeat(500);
    const p = document.createElement('p');
    const text = document.createTextNode(before + sel + after);
    p.appendChild(text);
    document.body.appendChild(p);

    selectRangeIn(text, before.length, before.length + sel.length);

    const result = readSelectionInPage();
    expect(result?.selectedText).toBe('TARGET');
    expect(result?.contextBefore.length).toBe(200);
    expect(result?.contextAfter.length).toBe(200);
    expect(result?.contextBefore).toBe('A'.repeat(200));
    expect(result?.contextAfter).toBe('B'.repeat(200));
  });

  it('records sourceUrl and pageTitle', () => {
    document.title = 'My Article';
    const p = document.createElement('p');
    const text = document.createTextNode('hello world');
    p.appendChild(text);
    document.body.appendChild(p);
    selectRangeIn(text, 0, 5);

    const result = readSelectionInPage();
    expect(result?.pageTitle).toBe('My Article');
    expect(result?.sourceUrl).toBe(location.href);
  });

  it('omits iframeUrl when window === window.parent', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('hello there');
    p.appendChild(text);
    document.body.appendChild(p);
    selectRangeIn(text, 0, 5);

    const result = readSelectionInPage();
    expect(result?.iframeUrl).toBeUndefined();
  });

  it('collapses embedded newlines and repeated whitespace in selected text', () => {
    // Simulates \n injected by replaced elements like <img>.
    const p = document.createElement('p');
    const text = document.createTextNode('hello\n world\n  foo');
    p.appendChild(text);
    document.body.appendChild(p);
    selectRangeIn(text, 0, text.data.length);

    const result = readSelectionInPage();
    expect(result?.selectedText).toBe('hello world foo');
  });

  it('trims leading and trailing whitespace from selected text', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('  trimmed  ');
    p.appendChild(text);
    document.body.appendChild(p);
    selectRangeIn(text, 0, text.data.length);

    const result = readSelectionInPage();
    expect(result?.selectedText).toBe('trimmed');
  });

  it('returns null when selection collapses to empty after normalization', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('  \n  \t  ');
    p.appendChild(text);
    document.body.appendChild(p);
    selectRangeIn(text, 0, text.data.length);

    expect(readSelectionInPage()).toBeNull();
  });
});
