import { describe, expect, it } from "vitest";
import { completionsAt } from "../client/completions";

/** "|" marks the caret. */
function at(source: string) {
  const offset = source.indexOf("|");
  const text = source.slice(0, offset) + source.slice(offset + 1);
  return { text, result: completionsAt(text, offset) };
}

describe("completionsAt", () => {
  it("suggests commands inside a command value, prefix matches first", () => {
    const { text, result } = at(`[{ "key": "x", "command": "edit|" }]`);
    expect(result!.items[0].label).toBe("editor.copy");
    expect(text.slice(result!.from, result!.to)).toBe("edit");
    expect(result!.items.some((i) => i.label === "-editor.copy")).toBe(true);
  });

  it("suggests all commands in an empty value", () => {
    const { result } = at(`[{ "command": "|" }]`);
    expect(result!.items.length).toBeGreaterThan(10);
  });

  it("completes the context identifier under the caret in when", () => {
    const { text, result } = at(`[{ "when": "!terminalFocus && has|Sel" }]`);
    expect(result!.items.map((i) => i.label)).toEqual(["hasSelection", "editorHasSelection"]);
    expect(text.slice(result!.from, result!.to)).toBe("hasSel");
  });

  it("suggests property names", () => {
    const { result } = at(`[{ "key": "x", "co|" }]`);
    expect(result!.items.map((i) => i.label)).toEqual(["command"]);
    expect(at(`[{ "|": 1 }]`).result!.items.map((i) => i.label)).toEqual(["key", "command", "when", "args"]);
  });

  it("works in an unterminated string while typing", () => {
    expect(at(`[{ "command": "cursor.wo|`).result!.items[0].label).toBe("cursor.wordLeft");
  });

  it("returns null elsewhere", () => {
    expect(at(`[{ "key": "ctrl|" }]`).result).toBeNull();
    expect(at(`[{ "key": "x"| }]`).result).toBeNull();
    expect(at(`[|]`).result).toBeNull();
    expect(at(`[{ "command": "zzz|" }]`).result).toBeNull();
    expect(at(`[{}, "a|"]`).result).toBeNull();
  });
});
