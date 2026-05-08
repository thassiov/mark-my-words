import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { showSaveCardInPage, type SaveCardArgs } from './save-card.js';

const HOST_ID = '#mmw-save-card-host';

function defaults(overrides: Partial<SaveCardArgs> = {}): SaveCardArgs {
  return {
    snippetId: 'snip-1',
    currentTags: [],
    currentNote: '',
    allTags: [],
    visibleMs: 5000,
    ...overrides,
  };
}

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>(HOST_ID);
  if (host === null || host.shadowRoot === null) {
    throw new Error('host or shadowRoot not found');
  }
  return host.shadowRoot;
}

function activePage(): HTMLElement {
  const el = root().querySelector<HTMLElement>('.page.is-active');
  if (el === null) throw new Error('no active page');
  return el;
}

function chipTags(): string[] {
  return [...root().querySelectorAll<HTMLElement>('.chip')].map((c) => c.dataset['tag'] ?? '');
}

describe('showSaveCardInPage', () => {
  let sendMessage: MockInstance;

  beforeEach(() => {
    document.body.innerHTML = '';
    for (const el of document.documentElement.querySelectorAll(HOST_ID)) {
      el.remove();
    }
    sendMessage = vi.fn().mockResolvedValue({ ok: true, value: null });
    vi.stubGlobal('chrome', { runtime: { sendMessage } });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const el of document.documentElement.querySelectorAll(HOST_ID)) {
      el.remove();
    }
  });

  describe('mount', () => {
    it('attaches a host element to documentElement', () => {
      showSaveCardInPage(defaults());
      const host = document.querySelector<HTMLElement>(HOST_ID);
      expect(host).not.toBeNull();
      expect(host?.parentElement).toBe(document.documentElement);
    });

    it('replaces an existing card instead of stacking', () => {
      showSaveCardInPage(defaults());
      showSaveCardInPage(defaults());
      expect(document.documentElement.querySelectorAll(HOST_ID).length).toBe(1);
    });

    it('starts on page 1 (idle)', () => {
      showSaveCardInPage(defaults());
      expect(activePage().dataset['page']).toBe('1');
    });
  });

  describe('initial state from args', () => {
    it('renders chips from currentTags on page 2', () => {
      showSaveCardInPage(defaults({ currentTags: ['design', 'ux'] }));
      expect(chipTags()).toEqual(['design', 'ux']);
    });

    it('pre-fills the textarea from currentNote', () => {
      showSaveCardInPage(defaults({ currentNote: 'remember this' }));
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text');
      expect(ta?.value).toBe('remember this');
    });

    it('renders suggestions from allTags excluding tags already applied', () => {
      showSaveCardInPage(
        defaults({ currentTags: ['ux'], allTags: ['api', 'design', 'ux', 'react'] }),
      );
      const labels = [...root().querySelectorAll<HTMLElement>('.sugg')].map((b) => b.textContent);
      expect(labels).toEqual(['api', 'design', 'react']);
    });

    it('caps suggestions at 8', () => {
      const many = Array.from({ length: 20 }, (_, i) => `tag-${String(i)}`);
      showSaveCardInPage(defaults({ allTags: many }));
      expect(root().querySelectorAll('.sugg').length).toBe(8);
    });

    it('reflects existing tag count in the page-1 row label', () => {
      showSaveCardInPage(defaults({ currentTags: ['a', 'b', 'c'] }));
      const row = root().querySelectorAll<HTMLElement>('.row')[0];
      expect(row?.querySelector('.row-label')?.textContent).toBe('3 tags');
      expect(row?.querySelector('.row-icon')?.textContent).toBe('✓');
    });

    it('reflects existing note in the page-1 row label', () => {
      showSaveCardInPage(defaults({ currentNote: 'something' }));
      const row = root().querySelectorAll<HTMLElement>('.row')[1];
      expect(row?.querySelector('.row-label')?.textContent).toBe('Note added');
    });

    it('uses singular "1 tag" when count is exactly 1', () => {
      showSaveCardInPage(defaults({ currentTags: ['solo'] }));
      const row = root().querySelectorAll<HTMLElement>('.row')[0];
      expect(row?.querySelector('.row-label')?.textContent).toBe('1 tag');
    });
  });

  describe('navigation', () => {
    it('Tag it click activates page 2', () => {
      showSaveCardInPage(defaults());
      const rows = root().querySelectorAll<HTMLButtonElement>('.row');
      rows[0]?.click();
      expect(activePage().dataset['page']).toBe('2');
    });

    it('Add a note click activates page 3', () => {
      showSaveCardInPage(defaults());
      const rows = root().querySelectorAll<HTMLButtonElement>('.row');
      rows[1]?.click();
      expect(activePage().dataset['page']).toBe('3');
    });

    it('back arrow returns to page 1', () => {
      showSaveCardInPage(defaults());
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      expect(activePage().dataset['page']).toBe('2');
      root().querySelector<HTMLButtonElement>('.back')?.click();
      expect(activePage().dataset['page']).toBe('1');
    });

    it('ESC on page 2 returns to page 1', () => {
      showSaveCardInPage(defaults());
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const host = document.querySelector<HTMLElement>(HOST_ID)!;
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(activePage().dataset['page']).toBe('1');
    });

    it('ESC on page 1 dismisses the card', () => {
      showSaveCardInPage(defaults());
      const host = document.querySelector<HTMLElement>(HOST_ID)!;
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector(HOST_ID)).toBeNull();
    });
  });

  describe('chip-input', () => {
    it('Enter on a non-empty input commits the text as a chip', () => {
      showSaveCardInPage(defaults());
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = 'newtag';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(chipTags()).toEqual(['newtag']);
      expect(input.value).toBe('');
    });

    it('Backspace on empty input removes the last chip', () => {
      showSaveCardInPage(defaults({ currentTags: ['a', 'b'] }));
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = '';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(chipTags()).toEqual(['a']);
    });

    it('clicking the chip × removes that chip', () => {
      showSaveCardInPage(defaults({ currentTags: ['keep', 'drop'] }));
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const xs = root().querySelectorAll<HTMLButtonElement>('.chip-x');
      xs[1]?.click();
      expect(chipTags()).toEqual(['keep']);
    });

    it('clicking a suggestion adds it as a chip', () => {
      showSaveCardInPage(defaults({ allTags: ['api', 'react'] }));
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const sugg = root().querySelectorAll<HTMLButtonElement>('.sugg');
      sugg[0]?.click();
      expect(chipTags()).toEqual(['api']);
    });
  });

  describe('persisting edits', () => {
    it('Done sends snippet:update with the current chip tags', () => {
      showSaveCardInPage(defaults({ currentTags: ['a'] }));
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = 'b';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      const done = activePage().querySelector<HTMLButtonElement>('.btn-primary')!;
      done.click();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'snippet:update',
        payload: { id: 'snip-1', edit: { tags: ['a', 'b'] } },
      });
    });

    it('Save sends snippet:update with the note text', () => {
      showSaveCardInPage(defaults());
      root().querySelectorAll<HTMLButtonElement>('.row')[1]?.click();
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      ta.value = 'keep this';
      const save = activePage().querySelector<HTMLButtonElement>('.btn-primary')!;
      save.click();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'snippet:update',
        payload: { id: 'snip-1', edit: { note: 'keep this' } },
      });
    });

    it('Cancel restores the textarea to the last-saved note (no message sent)', () => {
      showSaveCardInPage(defaults({ currentNote: 'original' }));
      root().querySelectorAll<HTMLButtonElement>('.row')[1]?.click();
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      ta.value = 'edited';
      const cancel = activePage().querySelector<HTMLButtonElement>('.btn-ghost')!;
      cancel.click();
      // Re-enter page 3 — value should be the original.
      root().querySelectorAll<HTMLButtonElement>('.row')[1]?.click();
      const ta2 = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      expect(ta2.value).toBe('original');
      expect(sendMessage).not.toHaveBeenCalled();
    });

    it('flips the tag row label after Done', () => {
      showSaveCardInPage(defaults());
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = 'foo';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      activePage().querySelector<HTMLButtonElement>('.btn-primary')?.click();
      const row = root().querySelectorAll<HTMLElement>('.row')[0];
      expect(row?.querySelector('.row-label')?.textContent).toBe('1 tag');
    });

    it('flips the note row label after Save', () => {
      showSaveCardInPage(defaults());
      root().querySelectorAll<HTMLButtonElement>('.row')[1]?.click();
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      ta.value = 'noted';
      activePage().querySelector<HTMLButtonElement>('.btn-primary')?.click();
      const row = root().querySelectorAll<HTMLElement>('.row')[1];
      expect(row?.querySelector('.row-label')?.textContent).toBe('Note added');
    });
  });

  describe('auto-dismiss', () => {
    it('removes the host after visibleMs on page 1', () => {
      showSaveCardInPage(defaults({ visibleMs: 1000 }));
      vi.advanceTimersByTime(999);
      expect(document.querySelector(HOST_ID)).not.toBeNull();
      vi.advanceTimersByTime(2);
      expect(document.querySelector(HOST_ID)).toBeNull();
    });

    it('does not auto-dismiss while on page 2', () => {
      showSaveCardInPage(defaults({ visibleMs: 1000 }));
      root().querySelectorAll<HTMLButtonElement>('.row')[0]?.click();
      vi.advanceTimersByTime(5000);
      expect(document.querySelector(HOST_ID)).not.toBeNull();
    });
  });
});
