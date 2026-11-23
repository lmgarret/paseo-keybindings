// Cursor motion inside a plain text value (input/textarea). Pure module (no DOM).

type CharClass = "space" | "word" | "punct";

function classOf(ch: string): CharClass {
  if (/\s/.test(ch)) return "space";
  if (/[\p{L}\p{N}_]/u.test(ch)) return "word";
  return "punct";
}

/** Start of the word before `pos`: skips whitespace, then one run of word or punctuation chars. */
export function wordStartBefore(value: string, pos: number): number {
  let i = Math.min(pos, value.length);
  while (i > 0 && classOf(value[i - 1]) === "space") i--;
  if (i === 0) return 0;
  const cls = classOf(value[i - 1]);
  while (i > 0 && classOf(value[i - 1]) === cls) i--;
  return i;
}

/** End of the word after `pos`: skips whitespace, then one run of word or punctuation chars. */
export function wordEndAfter(value: string, pos: number): number {
  let i = Math.max(pos, 0);
  while (i < value.length && classOf(value[i]) === "space") i++;
  if (i === value.length) return i;
  const cls = classOf(value[i]);
  while (i < value.length && classOf(value[i]) === cls) i++;
  return i;
}

export function lineStart(value: string, pos: number): number {
  // lastIndexOf clamps a negative fromIndex to 0 and would match a leading "\n".
  return pos <= 0 ? 0 : value.lastIndexOf("\n", pos - 1) + 1;
}

export function lineEnd(value: string, pos: number): number {
  const index = value.indexOf("\n", pos);
  return index === -1 ? value.length : index;
}
