/**
 * A typed key-value store keyed by `T['id']`.
 *
 * Implementations are responsible only for persistence, not for
 * domain-level rules (validation, ID generation, timestamping). Those
 * belong in the service layer that consumes the repository.
 */
export interface Repository<T extends { id: string }> {
  /** Return all stored items. Order is implementation-defined. */
  getAll(): Promise<T[]>;
  /** Return the item with the given id, or null if absent. */
  getById(id: string): Promise<T | null>;
  /** Insert or replace the item, keyed by `item.id`. */
  put(item: T): Promise<void>;
  /** Remove the item with the given id. No-op if absent. */
  delete(id: string): Promise<void>;
  /** Return the number of stored items. */
  count(): Promise<number>;
}
