/**
 * Args for {@link showSaveCardInPage}. Defined at module scope (type-only)
 * so the SW can import the shape; the runtime values are passed through
 * `chrome.scripting.executeScript({ args: [...] })`.
 */
export interface SaveCardArgs {
  snippetId: string;
  /** Tags currently on the snippet. Empty on initial save; non-empty when re-opening. */
  currentTags: readonly string[];
  /** Note currently on the snippet. Empty on initial save. */
  currentNote: string;
  /** All tags across the user's library, used to populate the suggestions row. */
  allTags: readonly string[];
  /** Auto-dismiss budget for page 1 idle. Cancelled once the user engages. */
  visibleMs: number;
}

/**
 * Multi-page "save card" overlay shown in the page after a successful save.
 *
 * **No module imports.** Shipped to the page context via
 * `chrome.scripting.executeScript({ func: showSaveCardInPage, args: [args] })`.
 * Anything referenced at runtime must be available in that context
 * (DOM globals are fine; closures over module-scope vars are not). For
 * the same reason, the inner builders cannot be hoisted to module scope —
 * the serialized function body would lose its references. Putting CSS at
 * module scope was a real bug for the same reason: the bundler left it
 * as a free variable in the serialized function source, throwing
 * ReferenceError in the page context.
 *
 * Lives inside a closed Shadow DOM so neither the host page's CSS bleeds
 * in nor our styles leak out. CSS is delivered via a constructable
 * stylesheet (adoptedStyleSheets) so a strict page CSP `style-src`
 * does not block us.
 *
 * Three pages: idle (page 1) → tags (page 2) / note (page 3). Done/Save
 * fire `snippet:update` optimistically and return to page 1 with the
 * row label flipped to reflect the saved state.
 */
/* eslint-disable max-lines-per-function, max-statements --
   helpers and constants must live inside the function body to survive
   executeScript serialization (see top docstring). */
export function showSaveCardInPage(args: SaveCardArgs): void {
  const { snippetId, currentTags, currentNote, allTags, visibleMs } = args;
  const HOST_ID = 'mmw-save-card-host';
  document.querySelector(`#${HOST_ID}`)?.remove();

  // The full stylesheet must live inside the function body — see the
  // disable-comment above. It is delivered via a constructable
  // CSSStyleSheet (adoptedStyleSheets) so a strict page CSP `style-src`
  // cannot block us.
  const CSS = `
:host {
  --bg: hsl(0 0% 100%);
  --fg: hsl(240 10% 3.9%);
  --card-bg: hsl(0 0% 100%);
  --card-fg: hsl(240 10% 3.9%);
  --primary: hsl(240 5.9% 10%);
  --primary-fg: hsl(0 0% 98%);
  --muted: hsl(240 4.8% 95.9%);
  --muted-fg: hsl(240 3.8% 46.1%);
  --border: hsl(240 5.9% 90%);
  --input: hsl(240 5.9% 90%);
  --ring: hsl(240 5% 64.9%);
  --success: hsl(142.1 76.2% 36.3%);
  --radius: 0.5rem;
  --shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.18), 0 4px 8px -4px rgba(0, 0, 0, 0.08);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :host {
    --bg: hsl(240 10% 3.9%);
    --fg: hsl(0 0% 98%);
    --card-bg: hsl(240 10% 3.9%);
    --card-fg: hsl(0 0% 98%);
    --primary: hsl(0 0% 98%);
    --primary-fg: hsl(240 5.9% 10%);
    --muted: hsl(240 3.7% 15.9%);
    --muted-fg: hsl(240 5% 64.9%);
    --border: hsl(240 3.7% 15.9%);
    --input: hsl(240 3.7% 15.9%);
    --ring: hsl(240 4.9% 83.9%);
    --success: hsl(142.1 70.6% 45.3%);
    --shadow: 0 10px 24px -6px rgba(0, 0, 0, 0.6), 0 4px 8px -4px rgba(0, 0, 0, 0.4);
  }
}
.card {
  width: 480px;
  max-width: calc(100vw - 32px);
  background: var(--card-bg);
  color: var(--card-fg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  font-family: var(--font);
  font-size: 14px;
  line-height: 1.4;
  padding: 16px;
  box-sizing: border-box;
}
.page { display: none; }
.page.is-active { display: block; animation: page-in 180ms ease both; }
@keyframes page-in {
  from { opacity: 0; transform: translateX(8px); }
  to   { opacity: 1; transform: translateX(0); }
}
.header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.status { font-weight: 600; color: var(--success); }
.title  { font-weight: 600; }
.view-link {
  margin-left: auto; background: transparent; border: 0;
  padding: 4px 6px; font: inherit; color: var(--muted-fg);
  cursor: pointer; border-radius: 6px;
}
.view-link:hover { background: var(--muted); color: var(--card-fg); }
.back {
  background: transparent; border: 1px solid var(--border);
  border-radius: 6px; width: 28px; height: 28px;
  font: inherit; font-size: 16px; line-height: 1;
  color: var(--card-fg); cursor: pointer;
}
.back:hover { background: var(--muted); }
.row {
  display: flex; align-items: center; gap: 12px; width: 100%;
  padding: 14px 14px; margin-bottom: 8px;
  background: transparent; border: 1px solid var(--border);
  border-radius: var(--radius); font: inherit; font-size: 15px;
  color: var(--card-fg); cursor: pointer; text-align: left;
  transition: background 120ms ease, border-color 120ms ease;
}
.row:last-child { margin-bottom: 0; }
.row:hover { background: var(--muted); border-color: var(--ring); }
.row-icon  { font-size: 18px; width: 24px; text-align: center; }
.row-label { flex: 1; font-weight: 500; }
.row-chev  { color: var(--muted-fg); font-size: 18px; }
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
  color: var(--card-fg); border-radius: 999px;
  font-size: 12px; line-height: 1.6;
}
.chip-x {
  background: transparent; border: 0; font: inherit;
  font-size: 14px; color: var(--muted-fg); cursor: pointer;
  width: 18px; height: 18px; border-radius: 999px;
  display: inline-flex; align-items: center; justify-content: center;
}
.chip-x:hover { background: var(--border); color: var(--card-fg); }
.chip-text {
  flex: 1; min-width: 80px; border: 0; background: transparent;
  outline: none; font: inherit; color: var(--card-fg); padding: 4px 0;
}
.suggestions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; margin-bottom: 12px; }
.suggestions-label { color: var(--muted-fg); font-size: 12px; margin-right: 4px; }
.sugg {
  background: transparent; border: 1px dashed var(--border);
  border-radius: 999px; padding: 2px 8px; font: inherit;
  font-size: 12px; color: var(--muted-fg); cursor: pointer;
}
.sugg:hover { background: var(--muted); color: var(--card-fg); border-style: solid; }
.note-text {
  width: 100%; box-sizing: border-box; padding: 10px 12px;
  border: 1px solid var(--input); border-radius: var(--radius);
  background: var(--bg); color: var(--card-fg); font: inherit;
  font-size: 14px; resize: vertical; min-height: 96px;
  outline: none; margin-bottom: 12px;
}
.note-text:focus { border-color: var(--ring); box-shadow: 0 0 0 3px hsl(240 5% 64.9% / 0.15); }
.footer { display: flex; justify-content: flex-end; }
.footer-split { justify-content: space-between; }
.btn {
  font: inherit; font-size: 14px; padding: 8px 14px;
  border-radius: var(--radius); cursor: pointer;
  border: 1px solid transparent;
  transition: background 120ms ease, border-color 120ms ease;
}
.btn-primary { background: var(--primary); color: var(--primary-fg); }
.btn-primary:hover { filter: brightness(1.1); }
.btn-ghost { background: transparent; border-color: var(--border); color: var(--card-fg); }
.btn-ghost:hover { background: var(--muted); }
`;

  // ------------------------------------------------------------------
  // Initial content (from args)
  // ------------------------------------------------------------------
  const SUGGESTION_CAP = 8;
  const initialChips = [...currentTags];
  // Suggestions exclude tags already on the snippet so we never show a
  // suggestion that would no-op when clicked.
  const applied = new Set(initialChips);
  const suggestions = allTags.filter((t) => !applied.has(t)).slice(0, SUGGESTION_CAP);

  // Last-saved state. Drives the page-1 row labels. Updated only on
  // Done/Save click — the in-DOM chip set and textarea value are the
  // working draft and may diverge from this until committed.
  let savedTagCount = currentTags.length;
  let noteSaved = currentNote.length > 0;

  // Refs into page 1, populated by buildPage1, mutated by syncRowLabels.
  let tagRow: HTMLElement;
  let noteRow: HTMLElement;

  // Auto-dismiss handle. Declared up here because `showPage('1')` runs
  // before the bottom of the function body and (transitively) reads it
  // — declaring lower would put it in the temporal dead zone.
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
  // Open mode: same CSS isolation as closed, but dev-tools inspection
  // and tests can reach in via `host.shadowRoot`. The real isolation we
  // care about is the CSS one, which is identical across modes.
  const shadow = host.attachShadow({ mode: 'open' });

  const sheet = new CSSStyleSheet();
  sheet.replaceSync(CSS);
  shadow.adoptedStyleSheets = [sheet];

  // ------------------------------------------------------------------
  // Card structure
  // ------------------------------------------------------------------
  const card = document.createElement('div');
  card.className = 'card';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Snippet save options');
  shadow.append(card);

  card.append(buildPage1(), buildPage2(), buildPage3());
  syncRowLabels();

  document.documentElement.append(host);

  // Page 1 is active on mount.
  showPage('1');
  startDismissTimer();

  // ------------------------------------------------------------------
  // Page builders
  // ------------------------------------------------------------------
  function buildPage1(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset['page'] = '1';

    const header = document.createElement('header');
    header.className = 'header';
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = '✓  Snippet saved';
    const view = document.createElement('button');
    view.className = 'view-link';
    view.type = 'button';
    view.textContent = 'View →';
    view.addEventListener('click', () => {
      void chrome.runtime.sendMessage({ type: 'ui:open-snippet', id: snippetId });
      dismiss();
    });
    header.append(status, view);

    tagRow = buildRowButton('🏷', 'Tag it', () => {
      showPage('2');
    });
    noteRow = buildRowButton('✎', 'Add a note', () => {
      showPage('3');
    });
    page.append(header, tagRow, noteRow);
    return page;
  }

  function buildPage2(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset['page'] = '2';

    page.append(buildBackHeader('Tags'));

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
      // Click anywhere in the chip box to focus the input.
      if (ev.target === chipBox) input.focus();
    });
    page.append(chipBox);

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
    page.append(sugg);

    const footer = document.createElement('div');
    footer.className = 'footer';
    const done = document.createElement('button');
    done.className = 'btn btn-primary';
    done.type = 'button';
    done.textContent = 'Done';
    done.addEventListener('click', () => {
      const tags = collectChipTags(chipBox);
      sendUpdate({ tags });
      savedTagCount = tags.length;
      syncRowLabels();
      showPage('1');
    });
    footer.append(done);
    page.append(footer);

    return page;
  }

  function buildPage3(): HTMLElement {
    const page = document.createElement('div');
    page.className = 'page';
    page.dataset['page'] = '3';

    page.append(buildBackHeader('Note'));

    const ta = document.createElement('textarea');
    ta.className = 'note-text';
    ta.placeholder = 'Worth referencing later…';
    ta.rows = 4;
    ta.value = currentNote;
    page.append(ta);

    const footer = document.createElement('div');
    footer.className = 'footer footer-split';
    const cancel = document.createElement('button');
    cancel.className = 'btn btn-ghost';
    cancel.type = 'button';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => {
      // Discard the working draft, restore to last-saved.
      ta.value = currentNote;
      showPage('1');
    });
    const save = document.createElement('button');
    save.className = 'btn btn-primary';
    save.type = 'button';
    save.textContent = 'Save';
    save.addEventListener('click', () => {
      const note = ta.value;
      sendUpdate({ note });
      noteSaved = note.length > 0;
      syncRowLabels();
      showPage('1');
    });
    footer.append(cancel, save);
    page.append(footer);

    // Save on Enter, newline on Shift+Enter, dismiss-edit on Esc.
    ta.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        save.click();
      }
    });

    return page;
  }

  function buildBackHeader(title: string): HTMLElement {
    const header = document.createElement('header');
    header.className = 'header';
    const back = document.createElement('button');
    back.className = 'back';
    back.type = 'button';
    back.setAttribute('aria-label', 'Back');
    back.textContent = '←';
    back.addEventListener('click', () => {
      showPage('1');
    });
    const t = document.createElement('span');
    t.className = 'title';
    t.textContent = title;
    header.append(back, t);
    return header;
  }

  function buildRowButton(icon: string, label: string, onClick: () => void): HTMLElement {
    const b = document.createElement('button');
    b.className = 'row';
    b.type = 'button';
    const i = document.createElement('span');
    i.className = 'row-icon';
    i.textContent = icon;
    const l = document.createElement('span');
    l.className = 'row-label';
    l.textContent = label;
    const c = document.createElement('span');
    c.className = 'row-chev';
    c.textContent = '›';
    b.append(i, l, c);
    b.addEventListener('click', onClick);
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

  /**
   * Reflect the last-saved state in the page-1 row labels. Called on
   * mount and after every successful Done/Save.
   */
  function syncRowLabels(): void {
    if (savedTagCount > 0) {
      const plural = savedTagCount === 1 ? '' : 's';
      setRowLabel(tagRow, '✓', `${String(savedTagCount)} tag${plural}`);
    } else {
      setRowLabel(tagRow, '🏷', 'Tag it');
    }
    if (noteSaved) {
      setRowLabel(noteRow, '✓', 'Note added');
    } else {
      setRowLabel(noteRow, '✎', 'Add a note');
    }
  }

  function setRowLabel(row: HTMLElement, icon: string, label: string): void {
    const iconEl = row.querySelector<HTMLElement>('.row-icon');
    const labelEl = row.querySelector<HTMLElement>('.row-label');
    if (iconEl) iconEl.textContent = icon;
    if (labelEl) labelEl.textContent = label;
  }

  function collectChipTags(chipBox: HTMLElement): string[] {
    const out: string[] = [];
    for (const el of chipBox.querySelectorAll<HTMLElement>('.chip')) {
      const t = el.dataset['tag'];
      if (typeof t === 'string' && t.length > 0) out.push(t);
    }
    return out;
  }

  /**
   * Fire-and-forget snippet:update. Optimistic UI — we navigate away
   * before the response, so failures are logged for diagnostics rather
   * than rolled back. Wrapped to suppress unhandled-rejection noise.
   */
  function sendUpdate(edit: { tags?: string[]; note?: string }): void {
    void chrome.runtime
      .sendMessage({ type: 'snippet:update', payload: { id: snippetId, edit } })
      .then((res: unknown) => {
        if (typeof res === 'object' && res !== null && (res as { ok?: unknown }).ok === false) {
          console.warn('[mark-my-words] save-card update rejected:', res);
        }
      })
      .catch((err: unknown) => {
        console.warn('[mark-my-words] save-card update failed:', err);
      });
  }

  // ------------------------------------------------------------------
  // Navigation + dismiss
  // ------------------------------------------------------------------
  function showPage(id: '1' | '2' | '3'): void {
    for (const p of card.querySelectorAll<HTMLElement>('.page')) {
      p.classList.toggle('is-active', p.dataset['page'] === id);
    }
    if (id === '1') {
      startDismissTimer();
    } else {
      cancelDismissTimer();
      // Autofocus into the active input on the page.
      requestAnimationFrame(() => {
        const target =
          id === '2'
            ? card.querySelector<HTMLInputElement>('.chip-text')
            : card.querySelector<HTMLTextAreaElement>('.note-text');
        target?.focus();
      });
    }
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

  // Cancel auto-dismiss on any user engagement; never resume.
  host.addEventListener('mouseenter', cancelDismissTimer);
  host.addEventListener('focusin', cancelDismissTimer);

  // Escape: page 2/3 → back; page 1 → dismiss.
  host.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Escape') return;
    const active = card.querySelector<HTMLElement>('.page.is-active');
    const id = active?.dataset['page'];
    if (id === '1') {
      dismiss();
    } else {
      showPage('1');
    }
  });
}
