import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { showToastInPage } from './show-toast.js';

describe('showToastInPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    for (const el of document.documentElement.querySelectorAll('#mmw-toast')) {
      el.remove();
    }
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const el of document.documentElement.querySelectorAll('#mmw-toast')) {
      el.remove();
    }
  });

  it('inserts a toast element with the given message', () => {
    showToastInPage('success', 'Snippet saved', 1000);
    const el = document.querySelector('#mmw-toast');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe('Snippet saved');
    expect(el?.getAttribute('role')).toBe('status');
  });

  it.each([
    ['success', '#16a34a', 'rgb(22, 163, 74)'],
    ['info', '#525252', 'rgb(82, 82, 82)'],
    ['error', '#b91c1c', 'rgb(185, 28, 28)'],
  ] as const)('uses the %s color', (variant, hex, expectedBg) => {
    showToastInPage(variant, 'hello', 1000);
    const el = document.querySelector<HTMLElement>('#mmw-toast')!;
    expect(el.style.background).toContain(hex);
    expect(expectedBg).toMatch(/^rgb\(/);
  });

  it('replaces an existing toast instead of stacking', () => {
    showToastInPage('info', 'first', 1000);
    showToastInPage('success', 'second', 1000);
    const all = document.querySelectorAll('#mmw-toast');
    expect(all.length).toBe(1);
    expect(all[0]?.textContent).toBe('second');
  });

  it('removes the toast after the given visibleMs + 200ms fade', () => {
    showToastInPage('success', 'gone soon', 3800);
    expect(document.querySelector('#mmw-toast')).not.toBeNull();
    vi.advanceTimersByTime(3800);
    expect(document.querySelector('#mmw-toast')).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(document.querySelector('#mmw-toast')).toBeNull();
  });

  it('honours a different visibleMs', () => {
    showToastInPage('info', 'short', 500);
    vi.advanceTimersByTime(500);
    expect(document.querySelector('#mmw-toast')).not.toBeNull();
    vi.advanceTimersByTime(200);
    expect(document.querySelector('#mmw-toast')).toBeNull();
  });

  it('attaches to documentElement so it survives body re-renders', () => {
    showToastInPage('info', 'top-level', 1000);
    const el = document.querySelector('#mmw-toast');
    expect(el?.parentElement).toBe(document.documentElement);
  });

  it('has pointerEvents none when no snippetId', () => {
    showToastInPage('success', 'Saved', 1000);
    const el = document.querySelector<HTMLElement>('#mmw-toast')!;
    expect(el.style.pointerEvents).toBe('none');
    expect(el.style.cursor).toBe('default');
  });

  describe('with snippetId', () => {
    let sendMessage: MockInstance;

    beforeEach(() => {
      sendMessage = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('chrome', { runtime: { sendMessage } });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sets pointerEvents to auto and cursor to pointer', () => {
      showToastInPage('success', 'Saved', 1000, 'snip-123');
      const el = document.querySelector<HTMLElement>('#mmw-toast')!;
      expect(el.style.pointerEvents).toBe('auto');
      expect(el.style.cursor).toBe('pointer');
    });

    it('appends a hint "— view →" span', () => {
      showToastInPage('success', 'Snippet saved', 1000, 'snip-123');
      const el = document.querySelector<HTMLElement>('#mmw-toast')!;
      expect(el.textContent).toContain('— view →');
    });

    it('clicking sends ui:open-record message with the id', () => {
      showToastInPage('success', 'Saved', 1000, 'snip-abc');
      const el = document.querySelector<HTMLElement>('#mmw-toast')!;
      el.click();
      expect(sendMessage).toHaveBeenCalledOnce();
      expect(sendMessage).toHaveBeenCalledWith({ type: 'ui:open-record', id: 'snip-abc' });
    });
  });
});
