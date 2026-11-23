import { describe, expect, it } from "vitest";
import { parseChord } from "../client/keys";
import type { NativeShortcut } from "../client/native-shortcuts";
import {
  formatStroke,
  isPaseoKeyFor,
  parseOverrides,
  parsePaseoCombo,
  paseoTrigger,
  strokeEventInit,
} from "../client/paseo-actions";

const MAC = { mac: true, desktop: true };
const LINUX = { mac: false, desktop: true };

const keyOf = (combo: string, mac = true) => parsePaseoCombo(combo, mac)?.map(formatStroke).join(" ");

describe("parsePaseoCombo", () => {
  it("reads modifiers, Mod per platform, and named keys", () => {
    expect(keyOf("Cmd+Shift+\\")).toBe("shift+meta+\\");
    expect(keyOf("Mod+/")).toBe("meta+/");
    expect(keyOf("Mod+/", false)).toBe("ctrl+/");
    expect(keyOf("Cmd+Alt+Shift+ArrowLeft")).toBe("shift+alt+meta+left");
    expect(keyOf("Ctrl+`")).toBe("ctrl+`");
    expect(keyOf("Escape")).toBe("escape");
    expect(keyOf("Shift+Tab")).toBe("shift+tab");
    expect(keyOf("Cmd+F5")).toBe("meta+f5");
  });

  it("maps the shifted ? to its physical key", () => {
    expect(keyOf("Shift+?")).toBe("shift+/");
  });

  it("marks the Digit placeholder", () => {
    const [stroke] = parsePaseoCombo("Alt+Digit", true)!;
    expect(stroke.digits).toBe(true);
    expect(formatStroke(stroke)).toBe("alt+1");
  });

  it("reads multi-stroke chords and rejects what it does not understand", () => {
    expect(keyOf("Cmd+K Cmd+C")).toBe("meta+k meta+c");
    for (const bad of ["", "Cmd+", "Cmd+Hyper+K", "Cmd+K+J", "Cmd+Unknown"]) expect(parsePaseoCombo(bad, true)).toBeNull();
  });
});

describe("strokeEventInit", () => {
  const init = (combo: string, digit?: number) => strokeEventInit(parsePaseoCombo(combo, true)![0], digit);

  it("builds key and code the way a US keyboard reports them", () => {
    expect(init("Cmd+B")).toEqual({ key: "b", code: "KeyB", metaKey: true, ctrlKey: false, shiftKey: false, altKey: false });
    expect(init("Cmd+Shift+P")).toMatchObject({ key: "P", code: "KeyP", shiftKey: true });
    expect(init("Cmd+\\")).toMatchObject({ key: "\\", code: "Backslash" });
    expect(init("Shift+?")).toMatchObject({ key: "?", code: "Slash" });
    expect(init("Mod+Shift+/")).toMatchObject({ key: "?", code: "Slash" });
    expect(init("Cmd+Shift+ArrowLeft")).toMatchObject({ key: "ArrowLeft", code: "ArrowLeft" });
  });

  it("fills in the digit for Digit strokes", () => {
    expect(init("Cmd+Digit", 3)).toMatchObject({ key: "3", code: "Digit3" });
    expect(init("Alt+Shift+Digit", 2)).toMatchObject({ key: "@", code: "Digit2" });
  });
});

describe("parseOverrides", () => {
  it("keeps strings and nulls, and ignores anything else", () => {
    expect(parseOverrides('{"a":"Cmd+J","b":null,"c":3}')).toEqual({ a: "Cmd+J", b: null });
    expect(parseOverrides("not json")).toEqual({});
    expect(parseOverrides("[1]")).toEqual({});
    expect(parseOverrides(null)).toEqual({});
  });
});

describe("current Paseo keys", () => {
  const SHORTCUTS: NativeShortcut[] = [
    { id: "left-mac", command: "sidebar.toggle.left", label: "Toggle left sidebar", combo: "Cmd+B", mac: true },
    { id: "left-other", command: "sidebar.toggle.left", label: "Toggle left sidebar", combo: "Ctrl+B", mac: false },
    { id: "prev", command: "workspace.navigate.relative", label: "Previous workspace", combo: "Cmd+[", args: { delta: -1 } },
    { id: "next", command: "workspace.navigate.relative", label: "Next workspace", combo: "Cmd+]", args: { delta: 1 } },
    { id: "jump", command: "workspace.navigate.index", label: "Jump to workspace", combo: "Cmd+Digit" },
    { id: "split", command: "workspace.pane.split.right", label: "Split pane right", combo: "Cmd+\\", mac: true },
  ];
  const trigger = (command: string, args: unknown, overrides = {}, platform = MAC) =>
    paseoTrigger(command, args, platform, overrides, SHORTCUTS);
  const keys = (t: ReturnType<typeof trigger>) => t && [t.strokes.map(formatStroke).join(" "), t.digit];

  it("uses the platform's default key", () => {
    expect(keys(trigger("sidebar.toggle.left", undefined))).toEqual(["meta+b", undefined]);
    expect(keys(trigger("sidebar.toggle.left", undefined, {}, LINUX))).toEqual(["ctrl+b", undefined]);
  });

  it("follows rebinds, and has no key once unassigned or off this platform", () => {
    expect(keys(trigger("sidebar.toggle.left", undefined, { "left-mac": "Cmd+Shift+B" }))).toEqual(["shift+meta+b", undefined]);
    expect(trigger("sidebar.toggle.left", undefined, { "left-mac": null })).toBeNull();
    expect(trigger("workspace.pane.split.right", undefined, {}, LINUX)).toBeNull();
    expect(trigger("unknown.action", undefined)).toBeNull();
  });

  it("picks the binding by args", () => {
    expect(keys(trigger("workspace.navigate.relative", { delta: -1 }))).toEqual(["meta+[", undefined]);
    expect(keys(trigger("workspace.navigate.relative", { delta: 1 }))).toEqual(["meta+]", undefined]);
    expect(keys(trigger("workspace.navigate.index", { index: 4 }))).toEqual(["meta+1", 4]);
    expect(trigger("workspace.navigate.index", {})).toBeNull();
    expect(trigger("workspace.navigate.index", { index: 12 })).toBeNull();
  });

  it("tells whether a key currently runs an action", () => {
    const is = (command: string, key: string, overrides = {}) =>
      isPaseoKeyFor(command, parseChord(key), MAC, overrides, SHORTCUTS);
    expect(is("sidebar.toggle.left", "meta+b")).toBe(true);
    expect(is("sidebar.toggle.left", "meta+j")).toBe(false);
    expect(is("sidebar.toggle.left", "meta+b", { "left-mac": "Cmd+J" })).toBe(false);
    expect(is("sidebar.toggle.left", "meta+j", { "left-mac": "Cmd+J" })).toBe(true);
    expect(is("workspace.navigate.index", "meta+7")).toBe(true);
    expect(is("workspace.navigate.index", "meta+0")).toBe(false);
  });
});
