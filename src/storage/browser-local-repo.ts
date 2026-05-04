import browser from 'webextension-polyfill';

import type { Repository } from './repository.js';

/**
 * `Repository` implementation backed by `browser.storage.local`.
 *
 * Each item is stored under its own key (`<prefix>.<id>`) rather than
 * a single object — `put` and `delete` stay O(1) regardless of the
 * total number of items. `getAll` and `count` walk all keys with the
 * prefix and are therefore O(n); fine at the v0 scale (<5,000 items)
 * but a candidate for an indexed backend if usage grows past that.
 *
 * Capacity ceiling for `browser.storage.local` is roughly 5 MB on
 * Chromium and 10 MB on Firefox.
 */
export class BrowserLocalRepo<T extends { id: string }> implements Repository<T> {
  private readonly keyPrefix: string;

  constructor(prefix: string) {
    this.keyPrefix = `${prefix}.`;
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private isOurKey(k: string): boolean {
    return k.startsWith(this.keyPrefix);
  }

  async getAll(): Promise<T[]> {
    const all = await browser.storage.local.get();
    const out: T[] = [];
    for (const [k, v] of Object.entries(all)) {
      if (this.isOurKey(k)) {
        out.push(v as T);
      }
    }
    return out;
  }

  async getById(id: string): Promise<T | null> {
    const k = this.key(id);
    const r = await browser.storage.local.get(k);
    const v = r[k];
    return v === undefined ? null : (v as T);
  }

  async put(item: T): Promise<void> {
    await browser.storage.local.set({ [this.key(item.id)]: item });
  }

  async delete(id: string): Promise<void> {
    await browser.storage.local.remove(this.key(id));
  }

  async count(): Promise<number> {
    const all = await browser.storage.local.get();
    let n = 0;
    for (const k of Object.keys(all)) {
      if (this.isOurKey(k)) n++;
    }
    return n;
  }
}
