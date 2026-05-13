/**
 * Split a string into (first ~N chars, rest), preferring a word
 * boundary near the cap. Used to render selectedText as
 * "title (big, bold)" + "excerpt continuation (small, muted)" on cards.
 */
export function splitForCard(text: string, firstCap: number): { first: string; rest: string } {
  if (text.length <= firstCap) return { first: text, rest: '' };
  // Prefer a space near firstCap. If no space within the last 12 chars
  // of the cap, just hard-cut.
  const boundary = text.lastIndexOf(' ', firstCap);
  const cut = boundary < firstCap - 12 ? firstCap : boundary;
  return { first: text.slice(0, cut), rest: text.slice(cut + 1) };
}

export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}
