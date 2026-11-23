import { describe, expect, it } from "vitest";
import {
  copyLines,
  deleteLines,
  type EditResult,
  indentSelection,
  moveLines,
  newlineWithIndent,
  toggleLineComment,
} from "../client/editor-ops";

/** Applies an edit and renders the selection as [ ] (or | for a caret). */
function apply(value: string, edit: EditResult): string {
  const next = value.slice(0, edit.start) + edit.insert + value.slice(edit.end);
  if (edit.selectionStart === edit.selectionEnd) {
    return next.slice(0, edit.selectionStart) + "|" + next.slice(edit.selectionStart);
  }
  return (
    next.slice(0, edit.selectionStart) +
    "[" +
    next.slice(edit.selectionStart, edit.selectionEnd) +
    "]" +
    next.slice(edit.selectionEnd)
  );
}

describe("indentSelection", () => {
  it("inserts spaces at a caret", () => {
    expect(apply("ab", indentSelection("ab", 1, 1))).toBe("a  |b");
  });

  it("indents and outdents covered lines, keeping the selection", () => {
    const value = "a\nb\nc";
    expect(apply(value, indentSelection(value, 0, 3))).toBe("  [a\n  b]\nc");
    const indented = "  a\n  b\nc";
    expect(apply(indented, indentSelection(indented, 2, 7, true))).toBe("[a\nb]\nc");
  });

  it("excludes a line the selection only touches at its start", () => {
    const value = "a\nb\n";
    expect(apply(value, indentSelection(value, 0, 2))).toBe("  [a\n]b\n");
  });

  it("outdents a caret line", () => {
    expect(apply("    x", indentSelection("    x", 4, 4, true))).toBe("  |x");
    expect(apply("x", indentSelection("x", 1, 1, true))).toBe("x|");
  });
});

describe("newlineWithIndent", () => {
  it("keeps the current indentation", () => {
    expect(apply("  a", newlineWithIndent("  a", 3, 3))).toBe("  a\n  |");
  });

  it("indents after an opening bracket", () => {
    expect(apply("  [", newlineWithIndent("  [", 3, 3))).toBe("  [\n    |");
  });

  it("splits empty brackets onto three lines", () => {
    expect(apply("  {}", newlineWithIndent("  {}", 3, 3))).toBe("  {\n    |\n  }");
    expect(apply("[ ]", newlineWithIndent("[ ]", 1, 1))).toBe("[\n  |\n]");
  });

  it("replaces a selection", () => {
    expect(apply("abc", newlineWithIndent("abc", 1, 2))).toBe("a\n|c");
  });
});

describe("toggleLineComment", () => {
  it("comments at the common indentation and uncomments", () => {
    const value = "  a\n    b";
    const commented = toggleLineComment(value, 0, value.length);
    expect(apply(value, commented)).toBe("[  // a\n  //   b]");
    const text = "  // a\n  //   b";
    expect(apply(text, toggleLineComment(text, 0, text.length))).toBe("[  a\n    b]");
  });

  it("skips blank lines and moves the caret with the text", () => {
    expect(apply("a\n\nb", toggleLineComment("a\n\nb", 0, 4))).toBe("[// a\n\n// b]");
    expect(apply("ab", toggleLineComment("ab", 1, 1))).toBe("// a|b");
  });
});

/** Runs an op on "text with | caret or [selection]" and renders the result the same way. */
function run(marked: string, op: (value: string, start: number, end: number) => EditResult | null): string | null {
  const caret = marked.indexOf("|");
  let value: string;
  let start: number;
  let end: number;
  if (caret !== -1) {
    value = marked.replace("|", "");
    start = end = caret;
  } else {
    start = marked.indexOf("[");
    end = marked.indexOf("]") - 1;
    value = marked.replace("[", "").replace("]", "");
  }
  const edit = op(value, start, end);
  return edit && apply(value, edit);
}

describe("deleteLines", () => {
  it("removes the caret line and keeps the column", () => {
    expect(run("one\ntw|o\nthree", deleteLines)).toBe("one\nth|ree");
    expect(run("one\ntwo\nthr|ee", deleteLines)).toBe("one\ntwo|");
    expect(run("one\ntwo\nt|hree", deleteLines)).toBe("one\nt|wo");
    expect(run("o|nly", deleteLines)).toBe("|");
  });

  it("removes every covered line, excluding a line the selection only touches", () => {
    expect(run("a\n[b\nc\n]d", deleteLines)).toBe("a\n|d");
  });

  it("handles a leading empty line at position 0", () => {
    expect(run("|\nabc", deleteLines)).toBe("|abc");
  });
});

describe("copyLines", () => {
  it("duplicates below and moves the selection to the copy", () => {
    expect(run("a\nb|c\nd", (v, s, e) => copyLines(v, s, e, "down"))).toBe("a\nbc\nb|c\nd");
    expect(run("[a\nb]", (v, s, e) => copyLines(v, s, e, "down"))).toBe("a\nb\n[a\nb]");
  });

  it("duplicates above and keeps the selection on the original position", () => {
    expect(run("a\nb|c", (v, s, e) => copyLines(v, s, e, "up"))).toBe("a\nb|c\nbc");
  });
});

describe("moveLines", () => {
  const up = (v: string, s: number, e: number) => moveLines(v, s, e, "up");
  const down = (v: string, s: number, e: number) => moveLines(v, s, e, "down");

  it("swaps with the neighbor line and keeps the selection on the moved text", () => {
    expect(run("a\nb|b\nc", up)).toBe("b|b\na\nc");
    expect(run("a\nb|b\nc", down)).toBe("a\nc\nb|b");
    expect(run("x\n[a\nb]\ny", up)).toBe("[a\nb]\nx\ny");
  });

  it("returns null at the edges", () => {
    expect(run("a|\nb", up)).toBeNull();
    expect(run("a\nb|", down)).toBeNull();
  });
});
