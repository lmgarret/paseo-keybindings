// IntelliSense-style suggestions for keybindings.json at a caret offset. Pure module (no DOM).
import { ALL_COMMANDS, CONTEXT_CATALOG } from "./catalog";
import { isTrivia, type Token, tokenize } from "./jsonc";

export interface CompletionItem {
  label: string;
  detail: string;
  /** Text that replaces [from, to). */
  insert: string;
}

export interface Completions {
  from: number;
  to: number;
  items: CompletionItem[];
}

const PROPERTIES: CompletionItem[] = [
  { label: "key", detail: 'Key, e.g. "ctrl+c"', insert: "key" },
  { label: "command", detail: "Command to run", insert: "command" },
  { label: "when", detail: "Condition, e.g. \"!terminalFocus\"", insert: "when" },
  { label: "args", detail: "Command arguments", insert: "args" },
];

function significantNeighbor(tokens: Token[], index: number, step: 1 | -1): Token | undefined {
  for (let i = index + step; i >= 0 && i < tokens.length; i += step) {
    if (!isTrivia(tokens[i])) return tokens[i];
  }
  return undefined;
}

function rank(items: CompletionItem[], query: string): CompletionItem[] {
  const q = query.toLowerCase();
  if (!q) return items;
  const scored = items
    .map((item) => ({ item, at: item.label.toLowerCase().indexOf(q) }))
    .filter((entry) => entry.at !== -1);
  scored.sort((a, b) => (a.at === 0 ? 0 : 1) - (b.at === 0 ? 0 : 1) || a.item.label.localeCompare(b.item.label));
  return scored.map((entry) => entry.item);
}

export function completionsAt(text: string, offset: number): Completions | null {
  const tokens = tokenize(text);
  const index = tokens.findIndex(
    (t) => (t.kind === "string" || (t.kind === "invalid" && t.text.startsWith('"'))) && t.start < offset && offset <= t.end,
  );
  if (index === -1) return null;
  const token = tokens[index];
  const closed = token.kind === "string";
  // Caret right after the closing quote is outside the string.
  if (closed && offset === token.end) return null;
  const contentStart = token.start + 1;
  const contentEnd = closed ? token.end - 1 : token.end;

  const next = significantNeighbor(tokens, index, 1);
  const prev = significantNeighbor(tokens, index, -1);
  const isPropertyName = next?.kind === "punctuation" && next.text === ":";
  if (isPropertyName || (prev?.kind === "punctuation" && (prev.text === "{" || prev.text === ","))) {
    // Only inside objects: "," also separates array items, which are objects, not strings.
    if (!isPropertyName && prev?.text === ",") {
      const before = significantNeighbor(tokens, tokens.indexOf(prev), -1);
      if (before?.text === "}") return null;
    }
    const items = rank(PROPERTIES, text.slice(contentStart, offset));
    return items.length ? { from: contentStart, to: contentEnd, items } : null;
  }

  if (prev?.kind !== "punctuation" || prev.text !== ":") return null;
  const keyToken = significantNeighbor(tokens, tokens.indexOf(prev), -1);
  if (keyToken?.kind !== "string") return null;
  const property = keyToken.text.slice(1, -1);

  if (property === "command") {
    const items = ALL_COMMANDS.flatMap((c) => [
      { label: c.id, detail: c.title, insert: c.id },
      { label: `-${c.id}`, detail: `Remove a default ${c.title} binding`, insert: `-${c.id}` },
    ]);
    const ranked = rank(items, text.slice(contentStart, offset));
    return ranked.length ? { from: contentStart, to: contentEnd, items: ranked } : null;
  }

  if (property === "when") {
    let from = offset;
    while (from > contentStart && /[\w.]/.test(text[from - 1])) from--;
    let to = offset;
    while (to < contentEnd && /[\w.]/.test(text[to])) to++;
    const items = CONTEXT_CATALOG.map((c) => ({ label: c.name, detail: c.description, insert: c.name }));
    const ranked = rank(items, text.slice(from, offset));
    return ranked.length ? { from, to, items: ranked } : null;
  }

  return null;
}
