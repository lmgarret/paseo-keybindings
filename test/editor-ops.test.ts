import { describe, expect, it } from "vitest";
import { type EditResult, indentSelection, newlineWithIndent, toggleLineComment } from "../client/editor-ops";

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
