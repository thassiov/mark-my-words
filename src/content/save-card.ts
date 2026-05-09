/**
 * Args for {@link showSaveCardInPage}. Defined at module scope (type-only)
 * so the SW can import the shape; the runtime values are passed through
 * `chrome.scripting.executeScript({ args: [...] })`.
 */
export interface SaveCardArgs {
  recordId: string;
  /** Tags currently on the record. Empty on initial save; non-empty when re-opening. */
  currentTags: readonly string[];
  /** All tags across the user's library, used to populate the suggestions row. */
  allTags: readonly string[];
  /** Auto-dismiss budget for the idle pill. Cancelled once the user engages. */
  visibleMs: number;
}

/**
 * Save-confirmation toast injected into the page after a successful
 * save. A single-line pill with three actions (VIEW / TAG / NOTE);
 * clicking TAG or NOTE opens a panel directly below the pill that
 * swaps content based on which button is active.
 *
 * **No module imports.** Shipped to the page context via
 * `chrome.scripting.executeScript({ func: showSaveCardInPage, args: [args] })`.
 * Anything referenced at runtime must be available in that context
 * (DOM globals are fine; closures over module-scope vars are not). For
 * the same reason, the inner builders and the CSS string cannot be
 * hoisted to module scope — the serialized function body would lose
 * its references.
 *
 * Lives inside a Shadow DOM (open mode for testability + dev-tools)
 * so neither the host page's CSS bleeds in nor our styles leak out.
 * CSS is delivered via a constructable stylesheet (adoptedStyleSheets)
 * so a strict page CSP `style-src` does not block us.
 *
 * State machine: idle | tag-open | note-open. Done/Save fire
 * `record:update` optimistically and return to idle.
 */
/* eslint-disable max-lines-per-function, max-statements, unicorn/consistent-function-scoping --
   helpers and constants must live inside the function body to survive
   executeScript serialization (see top docstring). */
export function showSaveCardInPage(args: SaveCardArgs): void {
  const { recordId, currentTags, allTags, visibleMs } = args;
  const HOST_ID = 'mmw-save-card-host';
  document.querySelector(`#${HOST_ID}`)?.remove();

  // Tokens are tuned for in-page injection: light/dark mode aware,
  // distinct per-button accents borrowed from the seahorse uiverse
  // card (View=blue, Tag=neutral dark, Note=red).
  const CSS = `
:host {
  --bg: hsl(0 0% 100%);
  --fg: hsl(240 10% 3.9%);
  --muted: hsl(240 4.8% 95.9%);
  --muted-fg: hsl(240 3.8% 46.1%);
  --border: hsl(240 5.9% 90%);
  --input: hsl(240 5.9% 90%);
  --ring: hsl(240 5% 64.9%);
  --success: hsl(142.1 76.2% 36.3%);
  --view-accent: hsl(232 62% 49%);
  --view-accent-fg: hsl(0 0% 98%);
  --tag-accent: hsl(0 0% 10%);
  --tag-accent-fg: hsl(0 0% 98%);
  --note-accent: hsl(0 65% 43%);
  --note-accent-fg: hsl(0 0% 98%);
  --radius: 0.875rem;
  --shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.18), 0 4px 8px -4px rgba(0, 0, 0, 0.08);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: hsl(240 10% 3.9%);
    --fg: hsl(0 0% 98%);
    --muted: hsl(240 3.7% 15.9%);
    --muted-fg: hsl(240 5% 64.9%);
    --border: hsl(240 3.7% 15.9%);
    --input: hsl(240 3.7% 15.9%);
    --ring: hsl(240 4.9% 83.9%);
    --success: hsl(142.1 70.6% 45.3%);
    --view-accent: hsl(232 80% 70%);
    --view-accent-fg: hsl(240 10% 3.9%);
    --tag-accent: hsl(0 0% 88%);
    --tag-accent-fg: hsl(240 10% 3.9%);
    --note-accent: hsl(0 70% 60%);
    --note-accent-fg: hsl(240 10% 3.9%);
    --shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.6), 0 4px 8px -4px rgba(0, 0, 0, 0.4);
  }
}

.toast { display: flex; flex-direction: column; gap: 8px; width: 480px; max-width: calc(100vw - 32px); }

.pill {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--font);
  display: flex;
  align-items: stretch;
  padding: 6px;
  gap: 4px;
}
.pill__status {
  display: inline-flex;
  align-items: center;
  padding: 8px 12px 8px 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--success);
  border-right: 1px solid var(--border);
  margin-right: 4px;
  white-space: nowrap;
}
.btn {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: transparent;
  border: 0;
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease;
}
.btn .icon { font-size: 13px; line-height: 1; }
.btn--view { color: var(--view-accent); }
.btn--view:hover, .btn--view.is-active {
  background: var(--view-accent); color: var(--view-accent-fg);
}
.btn--tag { color: var(--tag-accent); }
.btn--tag:hover, .btn--tag.is-active {
  background: var(--tag-accent); color: var(--tag-accent-fg);
}
.btn--note { color: var(--note-accent); }
.btn--note:hover, .btn--note.is-active {
  background: var(--note-accent); color: var(--note-accent-fg);
}

.panel {
  background: var(--bg);
  color: var(--fg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--font);
  font-size: 14px;
  padding: 16px;
  animation: panel-in 180ms ease both;
}
@keyframes panel-in {
  from { opacity: 0; transform: translateY(-6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.chip-input {
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
  padding: 8px 10px; border: 1px solid var(--input);
  border-radius: var(--radius); background: var(--bg);
  cursor: text; min-height: 40px;
}
.chip-input:focus-within { border-color: var(--ring); box-shadow: 0 0 0 3px hsl(240 5% 64.9% / 0.15); }
.chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 4px 2px 8px; background: var(--muted);
  color: var(--fg); border-radius: 999px;
  font-size: 12px; line-height: 1.6;
}
.chip-x {
  background: transparent; border: 0; font: inherit;
  font-size: 14px; color: var(--muted-fg); cursor: pointer;
  width: 18px; height: 18px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
}
.chip-x:hover { background: var(--border); color: var(--fg); }
.chip-text {
  flex: 1; min-width: 80px; border: 0; background: transparent;
  outline: none; font: inherit; color: var(--fg); padding: 4px 0;
}

.suggestions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; margin-bottom: 12px; }
.suggestions-label { color: var(--muted-fg); font-size: 12px; margin-right: 4px; }
.sugg {
  background: transparent; border: 1px dashed var(--border);
  border-radius: 999px; padding: 2px 8px; font: inherit;
  font-size: 12px; color: var(--muted-fg); cursor: pointer;
}
.sugg:hover { background: var(--muted); color: var(--fg); border-style: solid; }

.note-text {
  width: 100%; box-sizing: border-box; padding: 10px 12px;
  border: 1px solid var(--input); border-radius: var(--radius);
  background: var(--bg); color: var(--fg); font: inherit;
  font-size: 14px; resize: vertical; min-height: 96px;
  outline: none;
}
.note-text:focus { border-color: var(--ring); box-shadow: 0 0 0 3px hsl(240 5% 64.9% / 0.15); }

.panel__footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
.action {
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
}
.action--primary { background: var(--fg); color: var(--bg); }
.action--primary:hover { filter: brightness(1.1); }
.action--ghost { background: transparent; border-color: var(--border); color: var(--fg); }
.action--ghost:hover { background: var(--muted); }
`;

  // ------------------------------------------------------------------
  // Initial content (from args)
  // ------------------------------------------------------------------
  const SUGGESTION_CAP = 8;
  const initialChips = [...currentTags];
  const applied = new Set(initialChips);
  const suggestions = allTags.filter((t) => !applied.has(t)).slice(0, SUGGESTION_CAP);

  // State machine: which panel (if any) is open. Auto-dismiss only
  // fires from idle.
  let active: 'tag' | 'note' | null = null;
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;

  // ------------------------------------------------------------------
  // Host + shadow root
  // ------------------------------------------------------------------
  const host = document.createElement('div');
  host.id = HOST_ID;
  Object.assign(host.style, {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: '2147483647',
  });
  const shadow = host.attachShadow({ mode: 'open' });
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-label', 'Saved');
  shadow.append(toast);

  // ------------------------------------------------------------------
  // Pill (status + 3 buttons)
  // ------------------------------------------------------------------
  const pill = document.createElement('div');
  pill.className = 'pill';

  const status = document.createElement('span');
  status.className = 'pill__status';
  status.textContent = '✓ Saved';
  pill.append(status);

  const viewBtn = buildActionButton('view', '↗', 'View');
  viewBtn.addEventListener('click', () => {
    void chrome.runtime.sendMessage({ type: 'ui:open-record', id: recordId });
    dismiss();
  });
  pill.append(viewBtn);

  const tagBtn = buildActionButton('tag', '🏷', 'Tag');
  tagBtn.addEventListener('click', () => {
    setActive(active === 'tag' ? null : 'tag');
  });
  pill.append(tagBtn);

  const noteBtn = buildActionButton('note', '✎', 'Note');
  noteBtn.addEventListener('click', () => {
    setActive(active === 'note' ? null : 'note');
  });
  pill.append(noteBtn);

  toast.append(pill);

  // Panel slot — appended/removed by setActive.
  let panelEl: HTMLElement | null = null;

  document.documentElement.append(host);
  startDismissTimer();

  // ------------------------------------------------------------------
  // State transitions
  // ------------------------------------------------------------------
  function setActive(next: 'tag' | 'note' | null): void {
    active = next;
    // View is not a panel state — it dismisses the toast on click.
    tagBtn.classList.toggle('is-active', next === 'tag');
    noteBtn.classList.toggle('is-active', next === 'note');
    panelEl?.remove();
    panelEl = null;
    if (next === 'tag') {
      panelEl = buildTagPanel();
      toast.append(panelEl);
      cancelDismissTimer();
      requestAnimationFrame(() => {
        panelEl?.querySelector<HTMLInputElement>('.chip-text')?.focus();
      });
    } else if (next === 'note') {
      panelEl = buildNotePanel();
      toast.append(panelEl);
      cancelDismissTimer();
      requestAnimationFrame(() => {
        panelEl?.querySelector<HTMLTextAreaElement>('.note-text')?.focus();
      });
    } else {
      // Returning to idle restarts the auto-dismiss budget. Engagement
      // (hover/focus) still wins via the existing cancel listeners.
      startDismissTimer();
    }
  }

  // ------------------------------------------------------------------
  // Builders
  // ------------------------------------------------------------------
  function buildActionButton(
    kind: 'view' | 'tag' | 'note',
    icon: string,
    label: string,
  ): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn--${kind}`;
    const i = document.createElement('span');
    i.className = 'icon';
    i.textContent = icon;
    const l = document.createElement('span');
    l.textContent = label;
    b.append(i, l);
    return b;
  }

  function buildChip(text: string): HTMLElement {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset['tag'] = text;
    const label = document.createElement('span');
    label.textContent = text;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip-x';
    x.setAttribute('aria-label', `Remove ${text}`);
    x.textContent = '×';
    x.addEventListener('click', () => {
      chip.remove();
    });
    chip.append(label, x);
    return chip;
  }

  function collectChipTags(chipBox: HTMLElement): string[] {
    const out: string[] = [];
    for (const el of chipBox.querySelectorAll<HTMLElement>('.chip')) {
      const t = el.dataset['tag'];
      if (typeof t === 'string' && t.length > 0) out.push(t);
    }
    return out;
  }

  function buildTagPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.dataset['kind'] = 'tag';

    const chipBox = document.createElement('div');
    chipBox.className = 'chip-input';
    for (const t of initialChips) chipBox.append(buildChip(t));

    const input = document.createElement('input');
    input.className = 'chip-text';
    input.type = 'text';
    input.placeholder = 'Tag…';
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && input.value.trim() !== '') {
        ev.preventDefault();
        chipBox.insertBefore(buildChip(input.value.trim()), input);
        input.value = '';
      } else if (ev.key === 'Backspace' && input.value === '') {
        const last = chipBox.querySelector<HTMLElement>('.chip:last-of-type');
        last?.remove();
      }
    });
    chipBox.append(input);
    chipBox.addEventListener('click', (ev) => {
      if (ev.target === chipBox) input.focus();
    });
    panel.append(chipBox);

    if (suggestions.length > 0) {
      const sugg = document.createElement('div');
      sugg.className = 'suggestions';
      const suggLabel = document.createElement('span');
      suggLabel.className = 'suggestions-label';
      suggLabel.textContent = 'Suggestions';
      sugg.append(suggLabel);
      for (const s of suggestions) {
        const b = document.createElement('button');
        b.className = 'sugg';
        b.type = 'button';
        b.textContent = s;
        b.addEventListener('click', () => {
          chipBox.insertBefore(buildChip(s), input);
          input.focus();
        });
        sugg.append(b);
      }
      panel.append(sugg);
    }

    const footer = document.createElement('div');
    footer.className = 'panel__footer';
    const done = document.createElement('button');
    done.className = 'action action--primary';
    done.type = 'button';
    done.textContent = 'Done';
    done.addEventListener('click', () => {
      sendUpdate({ tags: collectChipTags(chipBox) });
      setActive(null);
    });
    footer.append(done);
    panel.append(footer);

    return panel;
  }

  function buildNotePanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.dataset['kind'] = 'note';

    const ta = document.createElement('textarea');
    ta.className = 'note-text';
    ta.placeholder = 'Worth referencing later…';
    ta.rows = 4;
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        save.click();
      }
    });
    panel.append(ta);

    const footer = document.createElement('div');
    footer.className = 'panel__footer';
    const cancel = document.createElement('button');
    cancel.className = 'action action--ghost';
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      ta.value = '';
      setActive(null);
    });
    const save = document.createElement('button');
    save.className = 'action action--primary';
    save.type = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', () => {
      addNote(ta.value);
      setActive(null);
    });
    footer.append(cancel, save);
    panel.append(footer);

    return panel;
  }

  /**
   * Fire-and-forget record:update. Optimistic UI — we close the panel
   * before the response, so failures are logged for diagnostics rather
   * than rolled back. Wrapped to suppress unhandled-rejection noise.
   *
   * Used for the Tag panel's Done. The Note panel uses {@link addNote}
   * instead, which goes through the dedicated record:add-note op.
   */
  function sendUpdate(edit: { tags?: string[] }): void {
    void chrome.runtime
      .sendMessage({ type: 'record:update', payload: { id: recordId, edit } })
      .then((res: unknown) => {
        if (typeof res === 'object' && res !== null && (res as { ok?: unknown }).ok === false) {
          console.warn('[mark-my-words] save-card update rejected:', res);
        }
      })
      .catch((err: unknown) => {
        console.warn('[mark-my-words] save-card update failed:', err);
      });
  }

  /**
   * Fire-and-forget record:add-note. Optimistic UI — empty/whitespace
   * is silently dropped (matches the panel's Save-disabled state for
   * the same content). Failures are logged.
   */
  function addNote(text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;
    void chrome.runtime
      .sendMessage({ type: 'record:add-note', payload: { id: recordId, text: trimmed } })
      .then((res: unknown) => {
        if (typeof res === 'object' && res !== null && (res as { ok?: unknown }).ok === false) {
          console.warn('[mark-my-words] save-card add-note rejected:', res);
        }
      })
      .catch((err: unknown) => {
        console.warn('[mark-my-words] save-card add-note failed:', err);
      });
  }

  function startDismissTimer(): void {
    cancelDismissTimer();
    dismissTimer = setTimeout(dismiss, visibleMs);
  }
  function cancelDismissTimer(): void {
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
  }
  function dismiss(): void {
    cancelDismissTimer();
    host.remove();
  }

  // ------------------------------------------------------------------
  // Engagement listeners
  // ------------------------------------------------------------------
  // Cancel auto-dismiss on hover/focus. Never resumes — once the user
  // engages, dismissal is their job.
  host.addEventListener('mouseenter', cancelDismissTimer);
  host.addEventListener('focusin', cancelDismissTimer);

  // ESC: panel-open → returns to idle; idle → dismisses entire toast.
  host.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    if (active === null) {
      dismiss();
    } else {
      setActive(null);
    }
  });
}
