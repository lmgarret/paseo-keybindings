import { describe, expect, it } from "vitest";
import {
  ALL_COMMANDS,
  canonicalCommand,
  COMMAND_CATALOG,
  type CommandInfo,
  commandInfo,
  CONTEXT_CATALOG,
  PASEO_COMMANDS,
} from "../client/catalog";
import { NATIVE_SHORTCUTS } from "../client/native-shortcuts";

const commands = COMMAND_CATALOG as readonly CommandInfo[];
const allIds = commands.flatMap((c) => [c.id, ...(c.aliases ?? [])]);

describe("command catalog", () => {
  it("has unique ids and aliases", () => {
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("resolves aliases to the catalog command", () => {
    expect(canonicalCommand("editor.action.deleteLines")).toBe("editor.deleteLines");
    expect(canonicalCommand("terminal.sendText")).toBe("terminal.sendSequence");
    expect(commandInfo("cursorTop")?.id).toBe("cursor.top");
    expect(canonicalCommand("not.a.command")).toBe("not.a.command");
  });

  it("has unique context names", () => {
    const names = CONTEXT_CATALOG.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("Paseo commands", () => {
  it("exposes every Paseo action once, under Paseo's ids", () => {
    const ids = PASEO_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(["workspace.pane.split.right", "sidebar.toggle.left", "message-input.focus"]));
    expect(ids).not.toContain("message-input.action");
  });

  it("gives arg templates to index and relative navigation", () => {
    expect(commandInfo("workspace.navigate.index")?.args).toEqual({ index: 1 });
    expect(commandInfo("workspace.tab.navigate.relative")?.args).toEqual({ delta: 1 });
  });

  it("lists every command once across both kinds", () => {
    const ids = ALL_COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(COMMAND_CATALOG.length + PASEO_COMMANDS.length - overlap().length);
  });
});

const overlap = () => PASEO_COMMANDS.filter((p) => allIds.includes(p.id));

// Scope guard: the plugin's own commands cover what Paseo does not. An id in both is handled at
// runtime (Paseo's implementation first), but should be a deliberate choice: when this fails after
// regenerating client/native-shortcuts.ts, check that the plugin's fallback still makes sense.
describe("no accidental overlap with Paseo's actions", () => {
  const nativeActions = new Set(NATIVE_SHORTCUTS.map((s) => s.command));
  const nativeLabels = new Set(NATIVE_SHORTCUTS.map((s) => s.label.toLowerCase()));

  it("has a native table to compare against", () => {
    expect(NATIVE_SHORTCUTS.length).toBeGreaterThan(20);
  });

  it("uses no Paseo action id", () => {
    expect(allIds.filter((id) => nativeActions.has(id))).toEqual([]);
  });

  it("uses no Paseo action label as a command title", () => {
    expect(commands.filter((c) => nativeLabels.has(c.title.toLowerCase())).map((c) => c.id)).toEqual([]);
  });
});
