import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readSelectionInPage } from './read-selection.js';

describe('readSelectionInPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'Test page';
    globalThis.getSelection()?.removeAllRanges();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    globalThis.getSelection()?.removeAllRanges();
  });

  function selectRangeIn(node: Text, start: number, end: number) {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end);
    const sel = globalThis.getSelection();
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
    p.append(text);
    document.body.append(p);
    selectRangeIn(text, 0, 5);
    expect(readSelectionInPage()).toBeNull();
  });

  it('captures the selected text and surrounding context', () => {
    const p = document.createElement('p');
    const longText =
      'The quick brown fox jumps over the lazy dog. ' +
      'It was a bright cold day in April, and the clocks were striking thirteen.';
    const text = document.createTextNode(longText);
    p.append(text);
    document.body.append(p);

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
    p.append(text);
    document.body.append(p);

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
    p.append(text);
    document.body.append(p);
    selectRangeIn(text, 0, 5);

    const result = readSelectionInPage();
    expect(result?.pageTitle).toBe('My Article');
    expect(result?.sourceUrl).toBe(location.href);
  });

  it('omits iframeUrl when window === window.parent', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('hello there');
    p.append(text);
    document.body.append(p);
    selectRangeIn(text, 0, 5);

    const result = readSelectionInPage();
    expect(result?.iframeUrl).toBeUndefined();
  });

  it('collapses embedded newlines and repeated whitespace in selected text', () => {
    // Simulates \n injected by replaced elements like <img>.
    const p = document.createElement('p');
    const text = document.createTextNode('hello\n world\n  foo');
    p.append(text);
    document.body.append(p);
    selectRangeIn(text, 0, text.data.length);

    const result = readSelectionInPage();
    expect(result?.selectedText).toBe('hello world foo');
  });

  it('trims leading and trailing whitespace from selected text', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('  trimmed  ');
    p.append(text);
    document.body.append(p);
    selectRangeIn(text, 0, text.data.length);

    const result = readSelectionInPage();
    expect(result?.selectedText).toBe('trimmed');
  });

  it('returns null when selection collapses to empty after normalization', () => {
    const p = document.createElement('p');
    const text = document.createTextNode('  \n  \t  ');
    p.append(text);
    document.body.append(p);
    selectRangeIn(text, 0, text.data.length);

    expect(readSelectionInPage()).toBeNull();
  });

  describe('context across non-text-node anchors and adjacent nodes', () => {
    it('captures context when the selection start anchor is an element node', () => {
      // Range starts at a non-text-node boundary: (p, 1), spanning <img>
      // and into the following text node.
      const p = document.createElement('p');
      const before = document.createTextNode('before');
      const img = document.createElement('img');
      const after = document.createTextNode('after the image');
      p.append(before);
      p.append(img);
      p.append(after);
      document.body.append(p);

      const range = document.createRange();
      range.setStart(p, 1); // right after `before`, at <img>
      range.setEnd(after, 5); // mid-after: "after"
      const sel = globalThis.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const result = readSelectionInPage();
      expect(result).not.toBeNull();
      // contextBefore should include the "before" text even though the
      // start anchor is an element node.
      expect(result?.contextBefore).toBe('before');
      expect(result?.contextAfter).toBe(' the image');
    });

    it('captures context when the selection end anchor is an element node', () => {
      // Range ends at a non-text-node boundary: (p, 2), after <img>.
      const p = document.createElement('p');
      const before = document.createTextNode('before the image');
      const img = document.createElement('img');
      const after = document.createTextNode('after');
      p.append(before);
      p.append(img);
      p.append(after);
      document.body.append(p);

      const range = document.createRange();
      range.setStart(before, 7); // mid-before: "before "
      range.setEnd(p, 2); // right after <img>
      const sel = globalThis.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const result = readSelectionInPage();
      expect(result).not.toBeNull();
      expect(result?.contextBefore).toBe('before ');
      expect(result?.contextAfter).toBe('after');
    });

    it('pulls contextBefore from a preceding sibling text node when the entire start text node is selected', () => {
      const p = document.createElement('p');
      const a = document.createTextNode('opening words. ');
      const b = document.createTextNode('SELECTED');
      const c = document.createTextNode(' closing words.');
      p.append(a);
      p.append(b);
      p.append(c);
      document.body.append(p);

      // Select the entire middle text node.
      selectRangeIn(b, 0, b.data.length);

      const result = readSelectionInPage();
      expect(result?.selectedText).toBe('SELECTED');
      expect(result?.contextBefore).toBe('opening words. ');
      expect(result?.contextAfter).toBe(' closing words.');
    });

    it('skips text inside <style> and <script> tags when gathering context', () => {
      // <style> in head, <script> sibling — neither should leak into context.
      const style = document.createElement('style');
      style.textContent = '.foo { color: red; }';
      document.body.append(style);

      const script = document.createElement('script');
      // Don't actually execute — just give it text content.
      script.textContent = "alert('boom');";
      document.body.append(script);

      const p = document.createElement('p');
      const before = document.createTextNode('real content before. ');
      const sel = document.createTextNode('SELECTED');
      const after = document.createTextNode(' real content after.');
      p.append(before);
      p.append(sel);
      p.append(after);
      document.body.append(p);

      selectRangeIn(sel, 0, sel.data.length);

      const result = readSelectionInPage();
      expect(result?.selectedText).toBe('SELECTED');
      expect(result?.contextBefore).toBe('real content before. ');
      expect(result?.contextAfter).toBe(' real content after.');
      expect(result?.contextBefore).not.toContain('color: red');
      expect(result?.contextBefore).not.toContain('alert');
      expect(result?.contextAfter).not.toContain('color: red');
      expect(result?.contextAfter).not.toContain('alert');
    });

    it("constrains context to the selection's nearest block-level ancestor", () => {
      // Three sibling paragraphs; select within just the middle one.
      // Sibling paragraphs MUST NOT leak into context — keeps the
      // "in context" view focused on the same paragraph.
      const p1 = document.createElement('p');
      p1.append(document.createTextNode('first paragraph.'));

      const p2 = document.createElement('p');
      const t2 = document.createTextNode('middle paragraph');
      p2.append(t2);

      const p3 = document.createElement('p');
      p3.append(document.createTextNode('third paragraph.'));

      document.body.append(p1);
      document.body.append(p2);
      document.body.append(p3);

      // Select "middle" within the middle paragraph.
      selectRangeIn(t2, 0, 'middle'.length);

      const result = readSelectionInPage();
      expect(result?.selectedText).toBe('middle');
      expect(result?.contextBefore).toBe('');
      expect(result?.contextAfter).toBe(' paragraph');
      // Crucially: nothing from sibling paragraphs.
      expect(result?.contextBefore).not.toContain('first');
      expect(result?.contextAfter).not.toContain('third');
    });

    it('walks across siblings when the selection itself spans multiple block elements', () => {
      // Cross-paragraph selection — commonAncestor climbs to the wrapper,
      // and context aggregates from siblings within that wrapper.
      const article = document.createElement('article');

      const p1 = document.createElement('p');
      const t1 = document.createTextNode('first paragraph.');
      p1.append(t1);

      const p2 = document.createElement('p');
      const t2 = document.createTextNode('second paragraph');
      p2.append(t2);

      const p3 = document.createElement('p');
      const t3 = document.createTextNode('third paragraph.');
      p3.append(t3);

      article.append(p1);
      article.append(p2);
      article.append(p3);
      document.body.append(article);

      // Selection: end of "first " through end of "second" — crosses p1→p2.
      const range = document.createRange();
      range.setStart(t1, 'first '.length);
      range.setEnd(t2, 'second'.length);
      const sel = globalThis.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

      const result = readSelectionInPage();
      expect(result?.contextBefore).toBe('first ');
      // Context after pulls from rest of p2 then p3 (text-node order).
      expect(result?.contextAfter).toContain('paragraph');
      expect(result?.contextAfter).toContain('third paragraph.');
    });
  });
});
