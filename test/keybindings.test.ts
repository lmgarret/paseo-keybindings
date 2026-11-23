import { describe, expect, it, vi } from "vitest";
import { compileKeybindings, dispatchKeybinding, type Keybinding, matchKeybindings } from "../client/keybindings";
import { parseChord } from "../client/keys";

const ctrlC = parseChord("ctrl+c");

// The terminal-aware copy binding recommended in the README.
const COPY_BINDING: Keybinding = { key: "ctrl+c", command: "editor.copy", when: "!terminalFocus && hasSelection" };

describe("terminal-aware copy binding", () => {
  const compiled = compileKeybindings([COPY_BINDING]);
  const copy = vi.fn(() => true);
  const commands = { "editor.copy": copy };

  it("copies with Ctrl+C when text is selected outside the terminal", () => {
    copy.mockClear();
    expect(dispatchKeybinding(compiled, ctrlC, { hasSelection: true }, commands)).toBe(true);
    expect(copy).toHaveBeenCalledOnce();
  });

  it("lets Ctrl+C through to a focused terminal, selection or not", () => {
    copy.mockClear();
    expect(dispatchKeybinding(compiled, ctrlC, { terminalFocus: true, hasSelection: true }, commands)).toBe(false);
    expect(dispatchKeybinding(compiled, ctrlC, { terminalFocus: true }, commands)).toBe(false);
    expect(copy).not.toHaveBeenCalled();
  });

  it("lets Ctrl+C through when nothing is selected", () => {
    expect(dispatchKeybinding(compiled, ctrlC, { inputFocus: true }, commands)).toBe(false);
  });

  it("leaves other keys alone", () => {
    for (const key of ["ctrl+r", "ctrl+a", "ctrl+backspace", "ctrl+shift+c", "meta+c", "c"]) {
      expect(dispatchKeybinding(compiled, parseChord(key), { hasSelection: true }, commands)).toBe(false);
    }
  });
});

describe("compileKeybindings", () => {
  it("reports and skips invalid entries", () => {
    const onError = vi.fn();
    const compiled = compileKeybindings(
      [
        { key: "hyper+c", command: "a" },
        { key: "ctrl+c", command: "b", when: "a &&" },
        { key: "ctrl+c", command: "c" },
      ],
      onError,
    );
    expect(onError).toHaveBeenCalledTimes(2);
    expect(compiled.map((entry) => entry.binding.command)).toEqual(["c"]);
  });

  it("removes earlier bindings with a -command entry", () => {
    const bindings: Keybinding[] = [
      { key: "ctrl+c", command: "editor.copy", when: "x" },
      { key: "ctrl+c", command: "editor.copy", when: "y" },
      { key: "ctrl+x", command: "editor.copy" },
      { key: "ctrl+c", command: "-editor.copy", when: "x" },
    ];
    expect(compileKeybindings(bindings).map((e) => e.binding.when)).toEqual(["y", undefined]);
    const all = compileKeybindings([...bindings, { key: "ctrl+c", command: "-editor.copy" }]);
    expect(all.map((e) => e.binding.key)).toEqual(["ctrl+x"]);
  });
});

describe("matchKeybindings / dispatchKeybinding", () => {
  const compiled = compileKeybindings([
    { key: "ctrl+c", command: "first" },
    { key: "ctrl+c", command: "second", when: "inputFocus" },
    { key: "ctrl+c", command: "missing", when: "terminalFocus" },
  ]);

  it("orders matches last-defined first", () => {
    expect(matchKeybindings(compiled, ctrlC, { inputFocus: true }).map((e) => e.binding.command)).toEqual([
      "second",
      "first",
    ]);
  });

  it("falls through to the next match when a command declines", () => {
    const calls: string[] = [];
    const handled = dispatchKeybinding(compiled, ctrlC, { inputFocus: true }, {
      first: () => (calls.push("first"), true),
      second: () => (calls.push("second"), false),
    });
    expect(handled).toBe(true);
    expect(calls).toEqual(["second", "first"]);
  });

  it("skips unknown commands", () => {
    expect(dispatchKeybinding(compiled, ctrlC, { terminalFocus: true }, { first: () => false })).toBe(false);
  });

  it("passes args to the command", () => {
    const run = vi.fn(() => true);
    const withArgs = compileKeybindings([{ key: "ctrl+c", command: "terminal.sendSequence", args: { text: "\u0003" } }]);
    dispatchKeybinding(withArgs, ctrlC, {}, { "terminal.sendSequence": run });
    expect(run).toHaveBeenCalledWith({ text: "\u0003" }, ctrlC);
  });
});

describe("command aliases", () => {
  it("runs VS Code and legacy ids as the catalog command", () => {
    const run = vi.fn(() => true);
    const commands = { "terminal.sendSequence": run, "cursor.wordLeft": run };
    for (const command of ["terminal.sendText", "workbench.action.terminal.sendSequence", "cursorWordLeft"]) {
      run.mockClear();
      const compiled = compileKeybindings([{ key: "ctrl+c", command, args: { text: "x" } }]);
      expect(compiled[0].command).not.toBe(command);
      expect(dispatchKeybinding(compiled, ctrlC, {}, commands)).toBe(true);
      expect(run).toHaveBeenCalledOnce();
    }
  });

  it("lets a removal name either id", () => {
    const compiled = compileKeybindings([
      { key: "ctrl+c", command: "editor.copy" },
      { key: "ctrl+c", command: "-editor.action.clipboardCopyAction" },
      { key: "ctrl+x", command: "editor.action.clipboardCutAction" },
      { key: "ctrl+x", command: "-editor.cut" },
    ]);
    expect(compiled).toEqual([]);
  });

  it("leaves unknown ids alone", () => {
    expect(compileKeybindings([{ key: "ctrl+c", command: "my.command" }])[0].command).toBe("my.command");
  });
});

describe("DEFAULT_KEYBINDINGS", () => {
  it("ships no bindings, so keys are untouched until the user adds some", async () => {
    const { DEFAULT_KEYBINDINGS } = await import("../client/defaults");
    expect(DEFAULT_KEYBINDINGS).toEqual([]);
  });
});

describe("results and external removals", () => {
  it("returns the first non-declining result, including release", () => {
    const compiled = compileKeybindings([
      { key: "ctrl+c", command: "a" },
      { key: "ctrl+c", command: "b" },
    ]);
    expect(dispatchKeybinding(compiled, ctrlC, {}, { a: () => "release", b: () => false })).toBe("release");
    expect(dispatchKeybinding(compiled, ctrlC, {}, { a: () => true, b: () => false })).toBe(true);
    expect(dispatchKeybinding(compiled, ctrlC, {}, { a: () => false, b: () => false })).toBe(false);
  });

  it("keeps removals of external commands as -<id> entries, in order", () => {
    const external = (command: string) => command === "workspace.new";
    const compiled = compileKeybindings(
      [
        { key: "meta+n", command: "workspace.new" },
        { key: "meta+n", command: "-workspace.new" },
        { key: "meta+n", command: "-editor.copy" },
      ],
      undefined,
      { isExternal: external },
    );
    expect(compiled.map((c) => c.command)).toEqual(["-workspace.new"]);
    const release = vi.fn(() => "release" as const);
    expect(dispatchKeybinding(compiled, parseChord("meta+n"), {}, { "-workspace.new": release })).toBe("release");
    expect(release).toHaveBeenCalledWith(undefined, parseChord("meta+n"));
  });
});

describe("removals, VS Code style", () => {
  const metaB = parseChord("meta+b");
  const external = (command: string) => command === "sidebar.toggle.left";

  it("remove defaults only, never the user's own bindings", () => {
    const compiled = compileKeybindings(
      [
        { key: "ctrl+c", command: "editor.copy" },
        { key: "ctrl+x", command: "editor.cut" },
        { key: "ctrl+c", command: "-editor.copy" },
        { key: "ctrl+x", command: "-editor.cut" },
      ],
      undefined,
      { defaultCount: 1 },
    );
    expect(compiled.map((c) => c.command)).toEqual(["editor.cut"]);
  });

  it("let a user binding win over a kept Paseo removal on the same key (Cmd+B → Cmd+J → Cmd+B)", () => {
    const compiled = compileKeybindings(
      [
        { key: "meta+b", command: "sidebar.toggle.left" },
        { key: "meta+b", command: "-sidebar.toggle.left" },
      ],
      undefined,
      { defaultCount: 0, isExternal: external },
    );
    const run = vi.fn(() => true);
    const release = vi.fn(() => "release" as const);
    const commands = { "sidebar.toggle.left": run, "-sidebar.toggle.left": release };
    expect(dispatchKeybinding(compiled, metaB, {}, commands)).toBe(true);
    expect(run).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();
  });

  it("apply a kept Paseo removal when no binding takes the key", () => {
    const compiled = compileKeybindings(
      [
        { key: "meta+b", command: "-sidebar.toggle.left" },
        { key: "meta+b", command: "editor.copy", when: "hasSelection" },
      ],
      undefined,
      { defaultCount: 0, isExternal: external },
    );
    const commands = { "editor.copy": () => true, "-sidebar.toggle.left": () => "release" as const };
    expect(dispatchKeybinding(compiled, metaB, { hasSelection: true }, commands)).toBe(true);
    expect(dispatchKeybinding(compiled, metaB, {}, commands)).toBe("release");
  });
});

