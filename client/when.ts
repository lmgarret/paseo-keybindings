// `when` clauses: identifiers combined with !, &&, ||, and parentheses.
// Precedence: ! binds tightest, then &&, then ||. Unknown identifiers are false.

export type WhenContext = Readonly<Record<string, boolean | undefined>>;
export type WhenPredicate = (context: WhenContext) => boolean;

type Token =
  | { type: "ident"; value: string }
  | { type: "not" | "and" | "or" | "lparen" | "rparen" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (source.startsWith("&&", i)) {
      tokens.push({ type: "and" });
      i += 2;
    } else if (source.startsWith("||", i)) {
      tokens.push({ type: "or" });
      i += 2;
    } else if (ch === "!") {
      tokens.push({ type: "not" });
      i++;
    } else if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
    } else if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
    } else {
      const match = /^[A-Za-z_][\w.]*/.exec(source.slice(i));
      if (!match) throw new Error(`Unexpected "${ch}" at ${i} in when clause "${source}"`);
      tokens.push({ type: "ident", value: match[0] });
      i += match[0].length;
    }
  }
  return tokens;
}

/** Context names referenced by a clause, with their offsets in the clause. Ignores syntax errors. */
export function whenIdentifiers(source: string): { name: string; start: number; end: number }[] {
  const result: { name: string; start: number; end: number }[] = [];
  const pattern = /[A-Za-z_][\w.]*/g;
  for (let match = pattern.exec(source); match; match = pattern.exec(source)) {
    if (match[0] !== "true" && match[0] !== "false") {
      result.push({ name: match[0], start: match.index, end: match.index + match[0].length });
    }
  }
  return result;
}

/** Compiles a when clause. An empty or missing clause always matches. Throws on syntax errors. */
export function compileWhen(source: string | undefined): WhenPredicate {
  if (source === undefined || source.trim() === "") return () => true;
  const tokens = tokenize(source);
  let pos = 0;

  const fail = (message: string): never => {
    throw new Error(`${message} in when clause "${source}"`);
  };

  const parseOr = (): WhenPredicate => {
    let left = parseAnd();
    while (tokens[pos]?.type === "or") {
      pos++;
      const l = left;
      const r = parseAnd();
      left = (ctx) => l(ctx) || r(ctx);
    }
    return left;
  };

  const parseAnd = (): WhenPredicate => {
    let left = parseUnary();
    while (tokens[pos]?.type === "and") {
      pos++;
      const l = left;
      const r = parseUnary();
      left = (ctx) => l(ctx) && r(ctx);
    }
    return left;
  };

  const parseUnary = (): WhenPredicate => {
    const token = tokens[pos];
    if (!token) return fail("Unexpected end");
    if (token.type === "not") {
      pos++;
      const inner = parseUnary();
      return (ctx) => !inner(ctx);
    }
    if (token.type === "lparen") {
      pos++;
      const inner = parseOr();
      if (tokens[pos]?.type !== "rparen") fail("Missing )");
      pos++;
      return inner;
    }
    if (token.type === "ident") {
      pos++;
      const name = token.value;
      if (name === "true") return () => true;
      if (name === "false") return () => false;
      return (ctx) => ctx[name] === true;
    }
    return fail(`Unexpected "${token.type}"`);
  };

  const predicate = parseOr();
  if (pos < tokens.length) fail("Unexpected trailing tokens");
  return predicate;
}
