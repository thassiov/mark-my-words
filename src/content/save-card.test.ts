import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { showSaveCardInPage, type SaveCardArgs } from './save-card.js';

const HOST_ID = '#mmw-save-card-host';

function defaults(overrides: Partial<SaveCardArgs> = {}): SaveCardArgs {
  return {
    recordId: 'rec-1',
    currentTags: [],
    currentNote: '',
    allTags: [],
    visibleMs: 5000,
    ...overrides,
  };
}

function root(): ShadowRoot {
  const shadow = document.querySelector<HTMLElement>(HOST_ID)?.shadowRoot;
  if (!shadow) throw new Error('host or shadowRoot not found');
  return shadow;
}

function btn(kind: 'view' | 'tag' | 'note'): HTMLButtonElement {
  const b = root().querySelector<HTMLButtonElement>(`.btn--${kind}`);
  if (!b) throw new Error(`button --${kind} not found`);
  return b;
}

function panel(): HTMLElement | null {
  return root().querySelector<HTMLElement>('.panel');
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

    it('replaces an existing toast instead of stacking', () => {
      showSaveCardInPage(defaults());
      showSaveCardInPage(defaults());
      expect(document.documentElement.querySelectorAll(HOST_ID).length).toBe(1);
    });

    it('renders the pill with status + three action buttons', () => {
      showSaveCardInPage(defaults());
      expect(root().querySelector('.pill__status')?.textContent).toContain('Saved');
      expect(root().querySelectorAll('.btn').length).toBe(3);
      expect(btn('view').textContent).toContain('View');
      expect(btn('tag').textContent).toContain('Tag');
      expect(btn('note').textContent).toContain('Note');
    });

    it('starts in idle state with no panel', () => {
      showSaveCardInPage(defaults());
      expect(panel()).toBeNull();
      expect(btn('tag').classList.contains('is-active')).toBe(false);
      expect(btn('note').classList.contains('is-active')).toBe(false);
    });
  });

  describe('view', () => {
    it('clicking VIEW sends ui:open-record and dismisses the toast', () => {
      showSaveCardInPage(defaults({ recordId: 'rec-abc' }));
      btn('view').click();
      expect(sendMessage).toHaveBeenCalledWith({ type: 'ui:open-record', id: 'rec-abc' });
      expect(document.querySelector(HOST_ID)).toBeNull();
    });
  });

  describe('tag panel', () => {
    it('clicking TAG opens the tag panel', () => {
      showSaveCardInPage(defaults({ currentTags: ['design', 'ux'] }));
      btn('tag').click();
      const p = panel();
      expect(p).not.toBeNull();
      expect(p?.dataset['kind']).toBe('tag');
      expect(chipTags()).toEqual(['design', 'ux']);
    });

    it('TAG button gets is-active while panel is open', () => {
      showSaveCardInPage(defaults());
      btn('tag').click();
      expect(btn('tag').classList.contains('is-active')).toBe(true);
      expect(btn('note').classList.contains('is-active')).toBe(false);
    });

    it('clicking TAG again returns to idle and removes the panel', () => {
      showSaveCardInPage(defaults());
      btn('tag').click();
      btn('tag').click();
      expect(panel()).toBeNull();
      expect(btn('tag').classList.contains('is-active')).toBe(false);
    });

    it('clicking NOTE while tag panel open switches active state', () => {
      showSaveCardInPage(defaults());
      btn('tag').click();
      btn('note').click();
      expect(btn('tag').classList.contains('is-active')).toBe(false);
      expect(btn('note').classList.contains('is-active')).toBe(true);
      expect(panel()?.dataset['kind']).toBe('note');
    });

    it('renders suggestions excluding tags already applied, capped at 8', () => {
      showSaveCardInPage(
        defaults({
          currentTags: ['ux'],
          allTags: ['api', 'design', 'ux', 'react'],
        }),
      );
      btn('tag').click();
      const labels = [...root().querySelectorAll<HTMLElement>('.sugg')].map((b) => b.textContent);
      expect(labels).toEqual(['api', 'design', 'react']);
    });

    it('Enter on a non-empty input commits a chip and clears the input', () => {
      showSaveCardInPage(defaults());
      btn('tag').click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = 'newtag';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(chipTags()).toEqual(['newtag']);
      expect(input.value).toBe('');
    });

    it('Backspace on empty input removes the last chip', () => {
      showSaveCardInPage(defaults({ currentTags: ['a', 'b'] }));
      btn('tag').click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = '';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
      expect(chipTags()).toEqual(['a']);
    });

    it('clicking a suggestion adds it as a chip', () => {
      showSaveCardInPage(defaults({ allTags: ['api', 'react'] }));
      btn('tag').click();
      root().querySelectorAll<HTMLButtonElement>('.sugg')[0]?.click();
      expect(chipTags()).toEqual(['api']);
    });

    it('Done sends record:update with the current chip tags and returns to idle', () => {
      showSaveCardInPage(defaults({ currentTags: ['a'] }));
      btn('tag').click();
      const input = root().querySelector<HTMLInputElement>('.chip-text')!;
      input.value = 'b';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      panel()!.querySelector<HTMLButtonElement>('.action--primary')!.click();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'record:update',
        payload: { id: 'rec-1', edit: { tags: ['a', 'b'] } },
      });
      expect(panel()).toBeNull();
      expect(btn('tag').classList.contains('is-active')).toBe(false);
    });
  });

  describe('note panel', () => {
    it('clicking NOTE opens the note panel pre-filled with currentNote', () => {
      showSaveCardInPage(defaults({ currentNote: 'remember this' }));
      btn('note').click();
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text');
      expect(ta?.value).toBe('remember this');
      expect(panel()?.dataset['kind']).toBe('note');
    });

    it('Save sends record:update with the note text and returns to idle', () => {
      showSaveCardInPage(defaults());
      btn('note').click();
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      ta.value = 'keep this';
      // Save is the .action--primary in the note panel.
      panel()!.querySelector<HTMLButtonElement>('.action--primary')!.click();
      expect(sendMessage).toHaveBeenCalledWith({
        type: 'record:update',
        payload: { id: 'rec-1', edit: { note: 'keep this' } },
      });
      expect(panel()).toBeNull();
    });

    it('Cancel restores currentNote and returns to idle (no message sent)', () => {
      showSaveCardInPage(defaults({ currentNote: 'original' }));
      btn('note').click();
      const ta = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      ta.value = 'edited';
      panel()!.querySelector<HTMLButtonElement>('.action--ghost')!.click();
      expect(sendMessage).not.toHaveBeenCalled();
      expect(panel()).toBeNull();
      // Re-open: should show the original.
      btn('note').click();
      const ta2 = root().querySelector<HTMLTextAreaElement>('.note-text')!;
      expect(ta2.value).toBe('original');
    });
  });

  describe('keyboard', () => {
    it('ESC on idle dismisses the toast', () => {
      showSaveCardInPage(defaults());
      const host = document.querySelector<HTMLElement>(HOST_ID)!;
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(document.querySelector(HOST_ID)).toBeNull();
    });

    it('ESC with a panel open returns to idle (does not dismiss)', () => {
      showSaveCardInPage(defaults());
      btn('tag').click();
      const host = document.querySelector<HTMLElement>(HOST_ID)!;
      host.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(panel()).toBeNull();
      expect(document.querySelector(HOST_ID)).not.toBeNull();
    });
  });

  describe('auto-dismiss', () => {
    it('removes the host after visibleMs when idle', () => {
      showSaveCardInPage(defaults({ visibleMs: 1000 }));
      vi.advanceTimersByTime(999);
      expect(document.querySelector(HOST_ID)).not.toBeNull();
      vi.advanceTimersByTime(2);
      expect(document.querySelector(HOST_ID)).toBeNull();
    });

    it('does not auto-dismiss while a panel is open', () => {
      showSaveCardInPage(defaults({ visibleMs: 1000 }));
      btn('tag').click();
      vi.advanceTimersByTime(5000);
      expect(document.querySelector(HOST_ID)).not.toBeNull();
    });

    it('restarts the timer when returning to idle from a panel', () => {
      showSaveCardInPage(defaults({ visibleMs: 1000 }));
      btn('tag').click();
      // Close the panel (idle again).
      btn('tag').click();
      vi.advanceTimersByTime(1001);
      expect(document.querySelector(HOST_ID)).toBeNull();
    });
  });
});
