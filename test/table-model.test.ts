import { describe, expect, it } from "vitest";
import type { Keybinding } from "../client/keybindings";
import { addBinding, buildRows, editRow, filterRows, removeRow, resetCommand } from "../client/table-model";
import { analyzeUserKeybindings } from "../client/user-bindings";

const DEFAULTS: Keybinding[] = [{ key: "ctrl+c", command: "editor.copy", when: "!terminalFocus && hasSelection" }];
const rowsFor = (text: string) => buildRows(DEFAULTS, analyzeUserKeybindings(text));
const copyRows = (text: string) => rowsFor(text).filter((r) => r.command === "editor.copy");

describe("buildRows", () => {
  it("lists defaults and unbound commands", () => {
    const rows = rowsFor("");
    expect(copyRows("")).toMatchObject([{ key: "ctrl+c", source: "default", when: "!terminalFocus && hasSelection" }]);
    expect(rows.find((r) => r.command === "editor.paste")).toMatchObject({ key: "", source: "unbound" });
  });

  it("hides defaults removed by the user and counts conflicts", () => {
    const text = `[
      { "key": "ctrl+c", "command": "-editor.copy" },
      { "key": "ctrl+c", "command": "editor.cut" },
      { "key": "ctrl+c", "command": "editor.paste" }
    ]`;
    expect(copyRows(text)).toMatchObject([{ source: "unbound" }]);
    const cut = rowsFor(text).find((r) => r.command === "editor.cut")!;
    expect(cut).toMatchObject({ source: "user", entryIndex: 1, conflicts: 1 });
  });
});

describe("filterRows", () => {
  const rows = rowsFor("");
  it("matches title, id, key, when, and source", () => {
    expect(filterRows(rows, "copy").map((r) => r.command)).toEqual(["editor.copy"]);
    expect(filterRows(rows, "terminalfocus")).toHaveLength(1);
    expect(filterRows(rows, "default")).toHaveLength(1);
  });

  it("matches an exact recorded key", () => {
    expect(filterRows(rows, "ignored", "ctrl+c").map((r) => r.command)).toEqual(["editor.copy"]);
    expect(filterRows(rows, "", "ctrl+x")).toEqual([]);
  });
});

describe("row actions", () => {
  it("editing a default adds an override and removes the default", () => {
    const row = copyRows("")[0];
    const edit = editRow("", analyzeUserKeybindings(""), row, { key: "ctrl+shift+c", command: "editor.copy" });
    const user = analyzeUserKeybindings(edit.text);
    expect(user.bindings).toEqual([
      { key: "ctrl+shift+c", command: "editor.copy" },
      { key: "ctrl+c", command: "-editor.copy", when: "!terminalFocus && hasSelection" },
    ]);
    expect(copyRows(edit.text)).toMatchObject([{ key: "ctrl+shift+c", source: "user" }]);
  });

  it("editing a user row replaces it", () => {
    const text = `[{ "key": "ctrl+x", "command": "editor.cut" }]`;
    const row = rowsFor(text).find((r) => r.command === "editor.cut")!;
    const edit = editRow(text, analyzeUserKeybindings(text), row, { key: "ctrl+x", command: "editor.cut", when: "inputFocus" });
    expect(analyzeUserKeybindings(edit.text).bindings).toEqual([{ key: "ctrl+x", command: "editor.cut", when: "inputFocus" }]);
  });

  it("removing a default appends a removal; reset restores it", () => {
    const removed = removeRow("", analyzeUserKeybindings(""), copyRows("")[0]).text;
    expect(copyRows(removed)).toMatchObject([{ source: "unbound" }]);
    const reset = resetCommand(removed, analyzeUserKeybindings(removed), "editor.copy").text;
    expect(copyRows(reset)).toMatchObject([{ source: "default" }]);
  });

  it("adds and removes user bindings", () => {
    const added = addBinding("", analyzeUserKeybindings(""), { key: "ctrl+v", command: "editor.paste" }).text;
    const row = rowsFor(added).find((r) => r.command === "editor.paste")!;
    expect(row.source).toBe("user");
    const removed = removeRow(added, analyzeUserKeybindings(added), row).text;
    expect(rowsFor(removed).find((r) => r.command === "editor.paste")!.source).toBe("unbound");
  });
});
