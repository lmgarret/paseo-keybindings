import { describe, expect, it } from "vitest";
import {
  analyzeUserKeybindings,
  appendBinding,
  NEW_FILE_TEMPLATE,
  removeBinding,
  replaceBinding,
} from "../client/user-bindings";

const file = `// mine
[
  // copy
  { "key": "ctrl+c", "command": "editor.copy", "when": "!terminalFocus" },
  { "key": "ctrl+k", "command": "terminal.sendText", "args": { "text": "\\u000b" } }
]
`;

describe("analyzeUserKeybindings", () => {
  it("extracts valid bindings", () => {
    const result = analyzeUserKeybindings(file);
    expect(result.editable).toBe(true);
    expect(result.diagnostics).toEqual([]);
    expect(result.bindings).toEqual([
      { key: "ctrl+c", command: "editor.copy", when: "!terminalFocus" },
      { key: "ctrl+k", command: "terminal.sendText", args: { text: "\u000b" } },
    ]);
  });

  it("treats empty and template files as no bindings", () => {
    expect(analyzeUserKeybindings("").bindings).toEqual([]);
    expect(analyzeUserKeybindings(NEW_FILE_TEMPLATE)).toMatchObject({ editable: true, bindings: [], diagnostics: [] });
  });

  it("reports syntax errors as not editable", () => {
    const result = analyzeUserKeybindings(`[ { "key": } ]`);
    expect(result.editable).toBe(false);
    expect(result.diagnostics[0].severity).toBe("error");
  });

  it("rejects non-array roots", () => {
    expect(analyzeUserKeybindings(`{}`).diagnostics[0].message).toMatch(/array/);
  });

  it("flags bad entries and skips them", () => {
    const text = `[
      { "command": "editor.copy" },
      { "key": "hyper+x", "command": "editor.copy" },
      { "key": "ctrl+x", "command": "editor.copy", "when": "a &&" },
      { "key": "ctrl+y", "command": "nope", "when": "terminalFocus && bogus", "extra": 1 },
      { "key": "ctrl+z", "command": "terminal.sendText" },
      42
    ]`;
    const result = analyzeUserKeybindings(text);
    const messages = result.diagnostics.map((d) => `${d.severity}: ${d.message}`);
    expect(messages).toEqual([
      'error: Missing property "key"',
      'error: Unknown modifier "hyper" in "hyper+x"',
      expect.stringMatching(/^error: Unexpected end/),
      'warning: Unknown property "extra"',
      'warning: Unknown command "nope"',
      'warning: Unknown context "bogus" (always false)',
      expect.stringMatching(/^warning: terminal.sendText needs args/),
      "error: Expected a keybinding object",
    ]);
    // Warnings do not disable an entry; errors do.
    expect(result.bindings.map((b) => b.key)).toEqual(["ctrl+y", "ctrl+z"]);
    const bogus = result.diagnostics.find((d) => d.message.includes("bogus"))!;
    expect(text.slice(bogus.start, bogus.end)).toBe("bogus");
  });
});

describe("edits", () => {
  const binding = { key: "ctrl+shift+x", command: "editor.cut", when: "inputFocus" };

  it("appends after the last entry and keeps comments", () => {
    const edit = appendBinding(file, analyzeUserKeybindings(file), binding);
    const result = analyzeUserKeybindings(edit.text);
    expect(result.bindings.at(-1)).toEqual(binding);
    expect(edit.text).toContain("// mine");
    expect(edit.text).toContain("// copy");
    expect(edit.text.slice(edit.range!.start, edit.range!.end)).toMatch(/^\{[\s\S]*\}$/);
  });

  it("appends after a trailing comma", () => {
    const text = `[\n  { "key": "a", "command": "editor.copy" },\n]`;
    const edit = appendBinding(text, analyzeUserKeybindings(text), binding);
    expect(analyzeUserKeybindings(edit.text).bindings).toHaveLength(2);
  });

  it("creates content for an empty file, an empty array, and the template", () => {
    for (const text of ["", "[]", NEW_FILE_TEMPLATE, "// only a comment\n"]) {
      const edit = appendBinding(text, analyzeUserKeybindings(text), binding);
      const result = analyzeUserKeybindings(edit.text);
      expect(result.diagnostics).toEqual([]);
      expect(result.bindings).toEqual([binding]);
    }
    expect(appendBinding("", analyzeUserKeybindings(""), binding).text.startsWith("// Place")).toBe(true);
  });

  it("refuses to edit a broken file", () => {
    expect(() => appendBinding("[", analyzeUserKeybindings("["), binding)).toThrow();
  });

  it("replaces an entry in place", () => {
    const analysis = analyzeUserKeybindings(file);
    const edit = replaceBinding(file, analysis.entries[0], binding);
    const result = analyzeUserKeybindings(edit.text);
    expect(result.bindings[0]).toEqual(binding);
    expect(result.bindings[1].key).toBe("ctrl+k");
    expect(edit.text).toContain("// copy");
  });

  it("removes first, last, and only entries cleanly", () => {
    const analysis = analyzeUserKeybindings(file);
    const withoutFirst = removeBinding(file, analysis, 0).text;
    expect(analyzeUserKeybindings(withoutFirst).bindings.map((b) => b.key)).toEqual(["ctrl+k"]);
    const withoutLast = removeBinding(file, analysis, 1).text;
    expect(analyzeUserKeybindings(withoutLast).bindings.map((b) => b.key)).toEqual(["ctrl+c"]);
    expect(analyzeUserKeybindings(withoutLast).diagnostics).toEqual([]);

    const single = `[\n  { "key": "a", "command": "editor.copy" }\n]\n`;
    expect(removeBinding(single, analyzeUserKeybindings(single), 0).text).toBe("[\n]\n");
  });

  it("accepts VS Code command ids and checks text args of any command taking them", () => {
    const text = `[
      { "key": "ctrl+shift+k", "command": "editor.action.deleteLines" },
      { "key": "ctrl+j", "command": "type" },
      { "key": "ctrl+t", "command": "editor.type", "args": { "text": "hi" } }
    ]`;
    const messages = analyzeUserKeybindings(text).diagnostics.map((d) => d.message);
    expect(messages).toEqual(['type needs args { "text": "..." }']);
  });

  it("knows Paseo's commands and their args", () => {
    const text = `[
      { "key": "cmd+d", "command": "workspace.pane.split.right" },
      { "key": "cmd+\\\\", "command": "-workspace.pane.split.right" },
      { "key": "ctrl+1", "command": "workspace.navigate.index" },
      { "key": "ctrl+tab", "command": "workspace.tab.navigate.relative", "args": { "delta": 1 } }
    ]`;
    const messages = analyzeUserKeybindings(text).diagnostics.map((d) => d.message);
    expect(messages).toEqual(['workspace.navigate.index needs args { "index": 1-9 }']);
  });
});

