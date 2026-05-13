/**
 * `<datalist>` id used by `TagAdder`'s input to surface existing tags as
 * autocomplete suggestions. The datalist itself is rendered once at the
 * top of `LibrarySection`; every adder in the list shares it.
 */
export const TAG_SUGGESTIONS_ID = 'mmw-tag-suggestions';

/** Map a tag string to a stable HSL hue in [0, 360). */
export function tagHue(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) {
    h = Math.trunc(h * 31 + (tag.codePointAt(i) ?? 0));
  }
  return ((h % 360) + 360) % 360;
}

/** Trim + lowercase a user-entered tag string. */
export function normalizeTag(t: string): string {
  return t.trim().toLowerCase();
}
