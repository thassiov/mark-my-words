import type { SaveCardArgs } from '../content/save-card.js';
import { showSaveCardInPage } from '../content/save-card.js';
import { showToastInPage } from '../content/show-toast.js';
import type { ToastVariant } from '../content/show-toast.js';

/**
 * Thin facade over the `chrome.*` surfaces the background script uses.
 *
 * Two reasons it exists:
 *
 *  1. **Testability** — every orchestration module in `src/background/`
 *     takes a `ChromeApi` as an injected dep. Tests pass a fake (typically
 *     `vitest-mock-extended`'s typed mock); production code passes the
 *     `realChromeApi` singleton at the bottom of this file.
 *  2. **Surface area control** — the SW touches a handful of `chrome.*`
 *     namespaces. Routing everything through one interface makes those
 *     dependencies explicit and forces a single place to mock when we
 *     port to Firefox or a hybrid container.
 *
 * Methods here are deliberately stupid — no business logic, no
 * fallbacks, no logging. The orchestration layer above handles those.
 */
export interface ChromeApi {
  /** ID of the currently active tab in the focused window, or undefined. */
  activeTabId(): Promise<number | undefined>;
  /**
   * Inject a function into the target tab and return the value it
   * returned. The function must be self-contained (serialised via
   * `Function.prototype.toString` — no closure references). Returns
   * `null` when the script executed but produced no result; rejects
   * when the injection itself failed (restricted page, missing tab).
   */
  executeInTab<R>(tabId: number, func: () => R): Promise<R | null>;
  /** Capture the active tab's viewport as a JPEG data URL. */
  captureVisibleTabJpeg(quality: number): Promise<string>;
  /** Inject the info / error toast helper into the tab. */
  showToast(tabId: number, args: ShowToastArgs): Promise<void>;
  /** Inject the multi-page save card helper into the tab. */
  showSaveCard(tabId: number, args: SaveCardArgs): Promise<void>;
  /**
   * Open a new tab to the given URL. Used by the save-card "View" button
   * to deep-link into the app.
   */
  openTab(url: string): Promise<void>;
  /** Open the extension's options/app page (toolbar-click target). */
  openAppPage(): Promise<void>;
  /**
   * Send a one-off message to every receiver listening on the runtime
   * bus (popup, app, etc.). Rejections are surfaced to the caller —
   * "no listener" is the common case and the caller decides whether
   * to swallow it.
   */
  sendRuntimeMessage(message: unknown): Promise<void>;
  /** Resolve the extension ID at runtime (used to build app deep-links). */
  extensionId(): string;
}

export interface ShowToastArgs {
  variant: ToastVariant;
  message: string;
  visibleMs: number;
  recordId?: string;
}

/**
 * Production implementation. Lives in this file so the rest of the
 * background package never touches `chrome.*` directly — grep for
 * `chrome\.` outside `service-worker.ts` and this file and you should
 * find nothing.
 */
export const realChromeApi: ChromeApi = {
  async activeTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
  },
  async executeInTab<R>(tabId: number, func: () => R): Promise<R | null> {
    const injections = await chrome.scripting.executeScript({ target: { tabId }, func });
    const result = injections[0]?.result;
    return (result ?? null) as R | null;
  },
  async captureVisibleTabJpeg(quality) {
    return chrome.tabs.captureVisibleTab({ format: 'jpeg', quality });
  },
  async showToast(tabId, { variant, message, visibleMs, recordId }) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showToastInPage,
      args: [variant, message, visibleMs, recordId],
    });
  },
  async showSaveCard(tabId, args) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: showSaveCardInPage,
      args: [args],
    });
  },
  async openTab(url) {
    await chrome.tabs.create({ url });
  },
  async openAppPage() {
    await chrome.runtime.openOptionsPage();
  },
  async sendRuntimeMessage(message) {
    await chrome.runtime.sendMessage(message);
  },
  extensionId() {
    return chrome.runtime.id;
  },
};
