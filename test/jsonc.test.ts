import { describe, expect, it } from "vitest";
import { format, lineColumnAt, parse, propertyKeyTokens, toValue, tokenize } from "../client/jsonc";

describe("parse", () => {
  it("parses JSON with comments and trailing commas", () => {
    const text = `// header\n[\n  { "key": "ctrl+c", /* inline */ "command": "x", },\n]`;
    const result = parse(text);
    expect(result.error).toBeUndefined();
    expect(toValue(result.root!)).toEqual([{ key: "ctrl+c", command: "x" }]);
  });

  it("records ranges and separators", () => {
    const text = `[{"a":1}, {"b":2},]`;
    const root = parse(text).root!;
    if (root.type !== "array") throw new Error("expected array");
    expect(text.slice(root.items[1].start, root.items[1].end)).toBe(`{"b":2}`);
    expect(root.separators).toEqual([9, 18]);
  });

  it("treats an empty or comment-only document as empty", () => {
    expect(parse("").root).toBeUndefined();
    expect(parse("  // nothing\n").error).toBeUndefined();
  });

  it("reports the first syntax error with its range", () => {
    const text = `[\n  { "key": "a" "command": "b" }\n]`;
    const { error } = parse(text);
    expect(error?.message).toMatch(/"," or "}" expected/);
    expect(lineColumnAt(text, error!.start)).toEqual({ line: 1, column: 15 });
    expect(parse(`["abc`).error?.message).toBe("Unterminated string");
    expect(parse(`[1] 2`).error?.message).toMatch(/End of file expected/);
    expect(parse(`{"a": }`).error?.message).toMatch(/Value expected/);
    expect(parse(`[tru]`).error?.message).toMatch(/Unexpected/);
  });
});

describe("tokenize / propertyKeyTokens", () => {
  it("marks property names", () => {
    const tokens = tokenize(`{"key": "value"}`);
    const keys = propertyKeyTokens(tokens);
    expect([...keys].map((i) => tokens[i].text)).toEqual([`"key"`]);
  });

  it("covers the full input", () => {
    const text = `[ /* x */ 1, "a\\"b", true ] // end`;
    expect(tokenize(text).map((t) => t.text).join("")).toBe(text);
  });
});

describe("format", () => {
  it("re-indents and keeps comments", () => {
    const text = `// keep me\n[{"key":"ctrl+c", // trailing\n"command":"editor.copy"},{"key":"x","command":"y","args":{}}]`;
    expect(format(text)).toBe(
      [
        "// keep me",
        "[",
        "  {",
        '    "key": "ctrl+c", // trailing',
        '    "command": "editor.copy"',
        "  },",
        "  {",
        '    "key": "x",',
        '    "command": "y",',
        '    "args": {}',
        "  }",
        "]",
        "",
      ].join("\n"),
    );
  });

  it("keeps own-line comments on their own line", () => {
    expect(format(`[\n// a\n1,\n/* b */\n2]`)).toBe("[\n  // a\n  1,\n  /* b */\n  2\n]\n");
  });

  it("is idempotent and refuses invalid input", () => {
    const once = format(`[{"a":[1,2,{}]},]`)!;
    expect(format(once)).toBe(once);
    expect(format(`[1,`)).toBeNull();
  });
});
