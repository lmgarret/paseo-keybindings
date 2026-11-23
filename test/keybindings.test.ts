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
    const withArgs = compileKeybindings([{ key: "ctrl+c", command: "terminal.sendText", args: { text: "\u0003" } }]);
    dispatchKeybinding(withArgs, ctrlC, {}, { "terminal.sendText": run });
    expect(run).toHaveBeenCalledWith({ text: "\u0003" });
  });
});

describe("DEFAULT_KEYBINDINGS", () => {
  it("ships no bindings, so keys are untouched until the user adds some", async () => {
    const { DEFAULT_KEYBINDINGS } = await import("../client/defaults");
    expect(DEFAULT_KEYBINDINGS).toEqual([]);
  });
});
