import { describe, expect, it } from "vitest";
import type { Keybinding } from "../client/keybindings";
import {
  addBinding,
  buildRows,
  editRow,
  filterRows,
  nativeRows,
  parseQuery,
  removeRow,
  resetCommand,
  rowKeys,
  sortRows,
  toggleSourceFilter,
} from "../client/table-model";
import type { NativeShortcut } from "../client/native-shortcuts";
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
    expect(cut).toMatchObject({ source: "user", entryIndex: 1, conflicts: ["Paste"] });
  });
});

describe("filterRows", () => {
  const rows = rowsFor("");
  it("matches title, id, key, when, and source", () => {
    expect(filterRows(rows, "editor.copy").map((r) => r.command)).toEqual([
      "editor.copy",
      "editor.copyLinesDown",
      "editor.copyLinesUp",
    ]);
    expect(filterRows(rows, "terminalfocus")).toHaveLength(1);
    expect(filterRows(rows, "default")).toHaveLength(1);
  });

  it("matches an exact recorded key", () => {
    expect(filterRows(rows, "ignored", "ctrl+c").map((r) => r.command)).toEqual(["editor.copy"]);
    expect(filterRows(rows, "", "ctrl+x")).toEqual([]);
  });
});

describe("field filters", () => {
  const rows = rowsFor(`[{ "key": "ctrl+v", "command": "editor.paste", "when": "inputFocus" }]`);

  it("parses @field:value tokens and keeps the rest as free text", () => {
    expect(parseQuery("@source:user  copy @keybinding:Ctrl @nope:x")).toEqual({
      fields: { source: ["user"], key: ["ctrl"] },
      text: "copy @nope:x",
    });
    expect(parseQuery("@source:").fields).toEqual({});
  });

  it("filters by source, command, keybinding, and when", () => {
    expect(filterRows(rows, "@source:user").map((r) => r.command)).toEqual(["editor.paste"]);
    expect(filterRows(rows, "@source:user @source:default").map((r) => r.source).sort()).toEqual(["default", "user"]);
    expect(filterRows(rows, "@keybinding:ctrl+c").map((r) => r.command)).toEqual(["editor.copy"]);
    expect(filterRows(rows, "@when:inputfocus").map((r) => r.command)).toEqual(["editor.paste"]);
    expect(filterRows(rows, "@command:copy @source:default").map((r) => r.command)).toEqual(["editor.copy"]);
  });

  it("toggles @source tokens in the query", () => {
    expect(toggleSourceFilter("copy", "user")).toBe("@source:user copy");
    expect(toggleSourceFilter("@source:user copy", "user")).toBe("copy");
    expect(toggleSourceFilter("x @source:user @source:paseo", "user")).toBe("x @source:paseo");
  });
});

describe("sortRows", () => {
  const rows = rowsFor(`[{ "key": "ctrl+v", "command": "editor.paste", "when": "inputFocus" }]`);

  it("sorts by key with unbound rows last in both directions", () => {
    const keys = (descending?: boolean) => sortRows(rows, { column: "key", descending }).map((r) => r.key);
    expect(keys().slice(0, 2)).toEqual(["ctrl+c", "ctrl+v"]);
    expect(keys(true).slice(0, 2)).toEqual(["ctrl+v", "ctrl+c"]);
    expect(keys(true).at(-1)).toBe("");
  });

  it("sorts by source", () => {
    expect(sortRows(rows, { column: "source" }).slice(0, 2).map((r) => r.source)).toEqual(["user", "default"]);
    expect(sortRows(rows, { column: "source", descending: true })[0].source).toBe("unbound");
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

describe("aliases in rows", () => {
  it("shows a VS Code id under its catalog command, and reset covers it", () => {
    const text = `[{ "key": "ctrl+shift+k", "command": "editor.action.deleteLines" }]`;
    const rows = rowsFor(text).filter((r) => r.command === "editor.deleteLines");
    expect(rows).toMatchObject([{ source: "user", title: "Delete Line", key: "ctrl+shift+k" }]);
    const reset = resetCommand(text, analyzeUserKeybindings(text), "editor.deleteLines").text;
    expect(rowsFor(reset).find((r) => r.command === "editor.deleteLines")).toMatchObject({ source: "unbound" });
  });

  it("hides a default removed through an alias", () => {
    expect(copyRows(`[{ "key": "ctrl+c", "command": "-editor.action.clipboardCopyAction" }]`)).toMatchObject([
      { source: "unbound" },
    ]);
  });
});

describe("Paseo rows", () => {
  const MAC = { mac: true, desktop: true };
  const LINUX_WEB = { mac: false, desktop: false };
  const SHORTCUTS: NativeShortcut[] = [
    { id: "new-mac", command: "workspace.new", label: "New workspace", combo: "Cmd+N", mac: true },
    { id: "new-other", command: "workspace.new", label: "New workspace", combo: "Ctrl+N", mac: false, note: "not in terminal" },
    { id: "model", command: "message-input.model-toggle", label: "Toggle model picker", combo: "Mod+/" },
    { id: "jump-mac", command: "workspace.navigate.index", label: "Jump to workspace", combo: "Cmd+Digit", mac: true, desktop: true },
    { id: "jump-web", command: "workspace.navigate.index", label: "Jump to workspace", combo: "Alt+Digit", desktop: false },
    { id: "next", command: "workspace.navigate.relative", label: "Next workspace", combo: "Cmd+]", args: { delta: 1 }, mac: true },
    { id: "close-pane", command: "workspace.pane.close", label: "Close pane", combo: "Cmd+Shift+W", mac: true },
  ];
  const rowsWith = (text: string, overrides = {}, platform = MAC) =>
    buildRows([], analyzeUserKeybindings(text), { platform, overrides, shortcuts: SHORTCUTS });
  const paseoRows = (text: string, overrides = {}, platform = MAC) =>
    rowsWith(text, overrides, platform).filter((r) => r.source === "paseo");

  it("keeps the platform's variants and resolves Mod", () => {
    expect(nativeRows(MAC, {}, SHORTCUTS).map((r) => r.key)).toEqual(["meta+n", "meta+/", "meta+1", "meta+]", "shift+meta+w"]);
    expect(nativeRows(LINUX_WEB, {}, SHORTCUTS).map((r) => [r.key, r.note])).toEqual([
      ["ctrl+n", "not in terminal"],
      ["ctrl+/", undefined],
      ["alt+1", undefined],
    ]);
  });

  it("applies rebinds and unassignments saved in Paseo's settings", () => {
    const rows = nativeRows(MAC, { "new-mac": "Cmd+Shift+P", model: null }, SHORTCUTS);
    expect(rows[0]).toMatchObject({ key: "shift+meta+p", note: "rebound in Paseo" });
    expect(rows[1]).toMatchObject({ key: "", note: "unassigned in Paseo" });
  });

  it("marks digit ranges and multi-stroke keys read-only", () => {
    const rows = nativeRows(MAC, { "new-mac": "Cmd+K Cmd+N" }, SHORTCUTS);
    expect(rows.find((r) => r.command === "workspace.navigate.index")).toMatchObject({ digits: true, readOnly: expect.any(String) });
    expect(rows[0]).toMatchObject({ key: "meta+k meta+n", readOnly: expect.any(String) });
    expect(rows.find((r) => r.command === "workspace.pane.close")?.readOnly).toBeUndefined();
  });

  it("expands digit rows to 1 through 9", () => {
    expect(rowKeys({ key: "alt+1", digits: true })).toHaveLength(9);
    expect(rowKeys({ key: "alt+1", digits: true })).toContain("alt+9");
    expect(rowKeys({ key: "" })).toEqual([]);
  });

  it("flags user bindings that take a Paseo key, both ways", () => {
    const text = `[
      { "key": "cmd+n", "command": "editor.type", "args": { "text": "x" } },
      { "key": "cmd+shift+w", "command": "noop", "when": "terminalFocus" }
    ]`;
    const rows = rowsWith(text);
    expect(rows.find((r) => r.command === "editor.type")).toMatchObject({ shadows: ["New workspace"] });
    expect(rows.find((r) => r.command === "noop")).toMatchObject({ shadows: ["Close pane"] });
    expect(rows.find((r) => r.source === "paseo" && r.title === "New workspace")).toMatchObject({ conflicts: ["Type"] });
  });

  it("sorts Paseo rows with the others by title", () => {
    const titles = rowsWith("").map((r) => r.title);
    expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
  });

  it("changing a Paseo row adds the new key and removes the old one", () => {
    const row = paseoRows("").find((r) => r.command === "workspace.new")!;
    const edit = editRow("", analyzeUserKeybindings(""), row, { key: "meta+j", command: "workspace.new" });
    expect(analyzeUserKeybindings(edit.text).bindings).toEqual([
      { key: "meta+j", command: "workspace.new" },
      { key: "meta+n", command: "-workspace.new" },
    ]);
    expect(paseoRows(edit.text).some((r) => r.command === "workspace.new")).toBe(false);
    const user = rowsWith(edit.text).find((r) => r.command === "workspace.new")!;
    expect(user).toMatchObject({ source: "user", key: "meta+j", title: "New workspace" });
    const reset = resetCommand(edit.text, analyzeUserKeybindings(edit.text), "workspace.new").text;
    expect(paseoRows(reset).some((r) => r.command === "workspace.new")).toBe(true);
  });

  it("changing back to the original key drops the leftover removal (Cmd+N → Cmd+J → Cmd+N)", () => {
    const row = paseoRows("").find((r) => r.command === "workspace.new")!;
    const moved = editRow("", analyzeUserKeybindings(""), row, { key: "meta+j", command: "workspace.new" }).text;
    const userRow = rowsWith(moved).find((r) => r.source === "user" && r.command === "workspace.new")!;
    const back = editRow(moved, analyzeUserKeybindings(moved), userRow, { key: "meta+n", command: "workspace.new" });
    expect(analyzeUserKeybindings(back.text).bindings).toEqual([{ key: "meta+n", command: "workspace.new" }]);
    expect(back.text.slice(back.range!.start, back.range!.end)).toContain('"meta+n"');
    // Listed once: the user row; the identical Paseo row is folded into it.
    expect(rowsWith(back.text).filter((r) => r.command === "workspace.new").map((r) => r.source)).toEqual(["user"]);
  });

  it("leaves a Paseo row alone when changed to its own key", () => {
    const row = paseoRows("").find((r) => r.command === "workspace.new")!;
    expect(editRow("", analyzeUserKeybindings(""), row, { key: "meta+n", command: "workspace.new" }).text).toBe("");
  });

  it("removing a Paseo row keeps its args out of the removal and titles args by label", () => {
    const row = paseoRows("").find((r) => r.command === "workspace.navigate.relative")!;
    expect(row.args).toEqual({ delta: 1 });
    const removed = removeRow("", analyzeUserKeybindings(""), row).text;
    expect(analyzeUserKeybindings(removed).bindings).toEqual([{ key: "meta+]", command: "-workspace.navigate.relative" }]);
    const added = addBinding("", analyzeUserKeybindings(""), {
      key: "ctrl+tab",
      command: "workspace.navigate.relative",
      args: { delta: 1 },
    }).text;
    expect(rowsWith(added).find((r) => r.source === "user")?.title).toBe("Next workspace");
  });

  it("finds Paseo rows by recorded key, including digit ranges", () => {
    const rows = rowsWith("");
    expect(filterRows(rows, "", "meta+n").map((r) => r.title)).toEqual(["New workspace"]);
    expect(filterRows(rows, "", "meta+5").map((r) => r.title)).toContain("Jump to workspace");
    // Every binding on any key of a digit row.
    expect(filterRows(rows, "", rowKeys({ key: "meta+1", digits: true })).map((r) => r.title)).toContain("Jump to workspace");
    const found = filterRows(rows, "paseo");
    expect(rows.filter((r) => r.source === "paseo").every((r) => found.includes(r))).toBe(true);
  });

  it("are omitted without a platform", () => {
    expect(rowsFor("").some((r) => r.source === "paseo")).toBe(false);
  });

  it("lists Paseo commands without a key here as unbound, with a note", () => {
    const rows = rowsWith("", {}, LINUX_WEB);
    expect(rows.find((r) => r.command === "workspace.pane.close")).toMatchObject({
      source: "unbound",
      note: expect.stringMatching(/no key/),
    });
  });
});
