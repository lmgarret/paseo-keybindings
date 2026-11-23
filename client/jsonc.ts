// JSON with comments and trailing commas (the keybindings.json dialect): tokenizer, parser with
// source ranges, and a comment-preserving formatter. Pure module (no DOM).

export type TokenKind =
  | "whitespace"
  | "lineComment"
  | "blockComment"
  | "string"
  | "number"
  | "keyword"
  | "punctuation"
  | "invalid";

export interface Token {
  kind: TokenKind;
  start: number;
  end: number;
  text: string;
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: TokenKind, end: number) => {
    tokens.push({ kind, start: i, end, text: text.slice(i, end) });
    i = end;
  };
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j++;
      push("whitespace", j);
    } else if (text.startsWith("//", i)) {
      const nl = text.indexOf("\n", i);
      push("lineComment", nl === -1 ? text.length : nl);
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      push(close === -1 ? "invalid" : "blockComment", close === -1 ? text.length : close + 2);
    } else if (ch === '"') {
      let j = i + 1;
      let closed = false;
      while (j < text.length && text[j] !== "\n") {
        if (text[j] === "\\") j += 2;
        else if (text[j] === '"') {
          j++;
          closed = true;
          break;
        } else j++;
      }
      push(closed ? "string" : "invalid", Math.min(j, text.length));
    } else if ("{}[]:,".includes(ch)) {
      push("punctuation", i + 1);
    } else {
      const number = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(i));
      if (number) push("number", i + number[0].length);
      else if (word) push(["true", "false", "null"].includes(word[0]) ? "keyword" : "invalid", i + word[0].length);
      else push("invalid", i + 1);
    }
  }
  return tokens;
}

export const isTrivia = (token: Token) =>
  token.kind === "whitespace" || token.kind === "lineComment" || token.kind === "blockComment";

interface NodeBase {
  start: number;
  end: number;
}
export interface JsonProperty extends NodeBase {
  key: string;
  keyStart: number;
  keyEnd: number;
  value: JsonNode;
}
export type JsonNode =
  | (NodeBase & { type: "object"; properties: JsonProperty[] })
  | (NodeBase & { type: "array"; items: JsonNode[]; separators: (number | undefined)[] })
  | (NodeBase & { type: "string"; value: string })
  | (NodeBase & { type: "number"; value: number })
  | (NodeBase & { type: "boolean"; value: boolean })
  | (NodeBase & { type: "null"; value: null });

export interface ParseError {
  start: number;
  end: number;
  message: string;
}

export interface ParseResult {
  /** Undefined for an empty document (only whitespace/comments) or a syntax error. */
  root?: JsonNode;
  error?: ParseError;
  tokens: Token[];
}

class SyntaxFailure extends Error {
  constructor(readonly detail: ParseError) {
    super(detail.message);
  }
}

export function parse(text: string): ParseResult {
  const tokens = tokenize(text);
  const significant = tokens.filter((token) => !isTrivia(token));
  let pos = 0;

  const fail = (token: Token | undefined, message: string): never => {
    const start = token?.start ?? text.length;
    throw new SyntaxFailure({ start, end: token ? token.end : start, message });
  };
  const peek = () => significant[pos];
  const isPunct = (token: Token | undefined, ch: string) => token?.kind === "punctuation" && token.text === ch;
  const describe = (token: Token | undefined) => (token ? `"${token.text.slice(0, 20)}"` : "end of file");

  const parseString = (token: Token): string => {
    try {
      return JSON.parse(token.text) as string;
    } catch {
      return fail(token, "Invalid string escape");
    }
  };

  const parseValue = (): JsonNode => {
    const token = peek();
    if (!token) return fail(undefined, "Value expected");
    if (isPunct(token, "{")) return parseObject();
    if (isPunct(token, "[")) return parseArray();
    pos++;
    switch (token.kind) {
      case "string":
        return { type: "string", value: parseString(token), start: token.start, end: token.end };
      case "number":
        return { type: "number", value: Number(token.text), start: token.start, end: token.end };
      case "keyword":
        return token.text === "null"
          ? { type: "null", value: null, start: token.start, end: token.end }
          : { type: "boolean", value: token.text === "true", start: token.start, end: token.end };
      case "invalid":
        return fail(token, token.text.startsWith('"') ? "Unterminated string" : `Unexpected ${describe(token)}`);
      default:
        return fail(token, `Value expected, got ${describe(token)}`);
    }
  };

  const parseObject = (): JsonNode => {
    const open = significant[pos++];
    const properties: JsonProperty[] = [];
    for (;;) {
      const token = peek();
      if (isPunct(token, "}")) {
        pos++;
        return { type: "object", properties, start: open.start, end: token.end };
      }
      if (token?.kind !== "string") return fail(token, `Property name or "}" expected, got ${describe(token)}`);
      pos++;
      const key = parseString(token);
      if (!isPunct(peek(), ":")) return fail(peek(), `":" expected after property name`);
      pos++;
      const value = parseValue();
      properties.push({ key, keyStart: token.start, keyEnd: token.end, value, start: token.start, end: value.end });
      const next = peek();
      if (isPunct(next, ",")) pos++;
      else if (!isPunct(next, "}")) return fail(next, `"," or "}" expected, got ${describe(next)}`);
    }
  };

  const parseArray = (): JsonNode => {
    const open = significant[pos++];
    const items: JsonNode[] = [];
    const separators: (number | undefined)[] = [];
    for (;;) {
      const token = peek();
      if (isPunct(token, "]")) {
        pos++;
        return { type: "array", items, separators, start: open.start, end: token.end };
      }
      items.push(parseValue());
      const next = peek();
      if (isPunct(next, ",")) {
        separators.push(next.end);
        pos++;
      } else if (isPunct(next, "]")) {
        separators.push(undefined);
      } else {
        return fail(next, `"," or "]" expected, got ${describe(next)}`);
      }
    }
  };

  try {
    if (significant.length === 0) return { tokens };
    const root = parseValue();
    if (pos < significant.length) fail(significant[pos], `End of file expected, got ${describe(significant[pos])}`);
    return { root, tokens };
  } catch (error) {
    if (error instanceof SyntaxFailure) return { error: error.detail, tokens };
    throw error;
  }
}

/** Converts a parsed node to a plain value. */
export function toValue(node: JsonNode): unknown {
  switch (node.type) {
    case "object":
      return Object.fromEntries(node.properties.map((p) => [p.key, toValue(p.value)]));
    case "array":
      return node.items.map(toValue);
    default:
      return node.value;
  }
}

/** Indices of string tokens used as property names (followed by ":"). */
export function propertyKeyTokens(tokens: readonly Token[]): Set<number> {
  const keys = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].kind !== "string") continue;
    let j = i + 1;
    while (j < tokens.length && isTrivia(tokens[j])) j++;
    if (tokens[j]?.kind === "punctuation" && tokens[j].text === ":") keys.add(i);
  }
  return keys;
}

/**
 * Re-indents the document, keeping comments and trailing commas. Returns null when the document
 * has a syntax error.
 */
export function format(text: string, unit = "  "): string | null {
  const parsed = parse(text);
  if (parsed.error) return null;
  const tokens = parsed.tokens;
  let out = "";
  let depth = 0;
  let needNewline = false;
  let lineHasContent = false;

  const newline = () => {
    out = out.replace(/[ \t]+$/, "") + "\n" + unit.repeat(depth);
    lineHasContent = false;
  };
  const emit = (s: string) => {
    if (needNewline && out !== "") newline();
    needNewline = false;
    out += s;
    lineHasContent = true;
  };
  const nextSignificant = (from: number) => {
    let j = from;
    while (j < tokens.length && tokens[j].kind === "whitespace") j++;
    return j;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === "whitespace") continue;
    const newlineBefore = i > 0 && tokens[i - 1].kind === "whitespace" && tokens[i - 1].text.includes("\n");

    if (token.kind === "lineComment" || token.kind === "blockComment") {
      if (!newlineBefore && lineHasContent && out !== "") {
        // Trailing comment: keep it on the line it followed.
        needNewline = false;
        out += " ";
        out += token.text;
      } else {
        if (lineHasContent) needNewline = true;
        emit(token.text);
      }
      if (token.kind === "lineComment" || newlineBefore) needNewline = true;
      continue;
    }

    if (token.kind === "punctuation") {
      switch (token.text) {
        case "{":
        case "[": {
          emit(token.text);
          const close = token.text === "{" ? "}" : "]";
          const j = nextSignificant(i + 1);
          if (tokens[j]?.kind === "punctuation" && tokens[j].text === close) {
            out += close;
            i = j;
          } else {
            depth++;
            needNewline = true;
          }
          continue;
        }
        case "}":
        case "]":
          depth--;
          needNewline = true;
          emit(token.text);
          continue;
        case ",":
          needNewline = false;
          emit(",");
          needNewline = true;
          continue;
        case ":":
          emit(": ");
          continue;
      }
    }
    emit(token.text);
  }
  return out.replace(/[ \t]+$/gm, "").trimEnd() + "\n";
}

/** 0-based line and column of an offset. */
export function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  let line = 0;
  let lineStartOffset = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      lineStartOffset = i + 1;
    }
  }
  return { line, column: offset - lineStartOffset };
}
