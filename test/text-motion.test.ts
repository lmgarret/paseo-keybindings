import { describe, expect, it } from "vitest";
import { lineEnd, lineStart, wordEndAfter, wordStartBefore } from "../client/text-motion";

describe("word motion", () => {
  const text = "hello  world.foo bar";

  it("moves to the start of the previous word", () => {
    expect(wordStartBefore(text, text.length)).toBe(17); // "bar"
    expect(wordStartBefore(text, 17)).toBe(13); // "foo"
    expect(wordStartBefore(text, 13)).toBe(12); // "."
    expect(wordStartBefore(text, 12)).toBe(7); // "world"
    expect(wordStartBefore(text, 7)).toBe(0); // "hello", across two spaces
    expect(wordStartBefore(text, 0)).toBe(0);
    expect(wordStartBefore("   ", 3)).toBe(0);
  });

  it("moves to the end of the next word", () => {
    expect(wordEndAfter(text, 0)).toBe(5);
    expect(wordEndAfter(text, 5)).toBe(12);
    expect(wordEndAfter(text, 12)).toBe(13);
    expect(wordEndAfter(text, 13)).toBe(16);
    expect(wordEndAfter(text, text.length)).toBe(text.length);
  });

  it("treats accented letters as word characters", () => {
    expect(wordStartBefore("café crème", 10)).toBe(5);
  });
});

describe("line motion", () => {
  const text = "one\ntwo three\n\nfour";

  it("finds line boundaries", () => {
    expect(lineStart(text, 8)).toBe(4);
    expect(lineEnd(text, 8)).toBe(13);
    expect(lineStart(text, 4)).toBe(4);
    expect(lineStart(text, 0)).toBe(0);
    expect(lineEnd(text, 2)).toBe(3);
    expect(lineStart(text, 14)).toBe(14);
    expect(lineEnd(text, 14)).toBe(14);
    expect(lineEnd(text, 16)).toBe(text.length);
  });
});

describe("lineStart at the edges", () => {
  it("does not skip a leading newline at position 0", () => {
    expect(lineStart("\nabc", 0)).toBe(0);
    expect(lineStart("\nabc", 1)).toBe(1);
  });
});
