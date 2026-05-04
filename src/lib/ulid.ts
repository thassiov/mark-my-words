import { ulid } from 'ulid';

/**
 * Generate a fresh ULID. Wrapper exists so tests can mock id generation
 * without touching the third-party module directly.
 */
export function newId(): string {
  return ulid();
}
