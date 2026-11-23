import { describe, expect, it } from "vitest";
import { chordFromEvent, chordsEqual, formatChord, parseChord } from "../client/keys";

const event = (over: Partial<Parameters<typeof chordFromEvent>[0]>) => ({
  key: "",
  code: "",
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  metaKey: false,
  ...over,
});

describe("parseChord", () => {
  it("parses modifiers and key", () => {
    expect(parseChord("ctrl+shift+c")).toEqual({ ctrl: true, shift: true, alt: false, meta: false, key: "c" });
  });

  it("accepts modifier aliases and is case-insensitive", () => {
    expect(formatChord(parseChord("Cmd+Option+Left"))).toBe("alt+meta+left");
    expect(formatChord(parseChord("control+ArrowRight"))).toBe("ctrl+right");
  });

  it("handles the plus key", () => {
    expect(parseChord("ctrl++").key).toBe("+");
  });

  it("rejects invalid input", () => {
    expect(() => parseChord("")).toThrow();
    expect(() => parseChord("hyper+c")).toThrow(/Unknown modifier/);
    expect(() => parseChord("ctrl+")).toThrow();
    expect(() => parseChord("ctrl+shift")).toThrow();
    expect(() => parseChord("ctrl+k ctrl+c")).toThrow(/Multi-stroke/);
  });
});

describe("chordFromEvent", () => {
  it("uses the physical letter so Alt/Shift/layout do not change it", () => {
    expect(chordFromEvent(event({ key: "∫", code: "KeyB", altKey: true }))).toEqual(parseChord("alt+b"));
    expect(chordFromEvent(event({ key: "C", code: "KeyC", ctrlKey: true, shiftKey: true }))).toEqual(
      parseChord("ctrl+shift+c"),
    );
  });

  it("maps digits, punctuation and named keys", () => {
    expect(chordFromEvent(event({ key: "!", code: "Digit1", shiftKey: true }))?.key).toBe("1");
    expect(chordFromEvent(event({ key: "?", code: "Slash", shiftKey: true }))?.key).toBe("/");
    expect(chordFromEvent(event({ key: "ArrowLeft", code: "ArrowLeft" }))?.key).toBe("left");
    expect(chordFromEvent(event({ key: "Backspace", code: "Backspace", ctrlKey: true }))).toEqual(
      parseChord("ctrl+backspace"),
    );
    expect(chordFromEvent(event({ key: " ", code: "Space" }))?.key).toBe("space");
  });

  it("ignores lone modifier presses", () => {
    expect(chordFromEvent(event({ key: "Control", code: "ControlLeft", ctrlKey: true }))).toBeNull();
    expect(chordFromEvent(event({ key: "Meta", code: "MetaLeft", metaKey: true }))).toBeNull();
  });

  it("requires an exact modifier match", () => {
    const ctrlC = parseChord("ctrl+c");
    expect(chordsEqual(ctrlC, chordFromEvent(event({ key: "c", code: "KeyC", ctrlKey: true }))!)).toBe(true);
    expect(
      chordsEqual(ctrlC, chordFromEvent(event({ key: "c", code: "KeyC", ctrlKey: true, shiftKey: true }))!),
    ).toBe(false);
    expect(chordsEqual(ctrlC, chordFromEvent(event({ key: "c", code: "KeyC", metaKey: true }))!)).toBe(false);
  });
});
