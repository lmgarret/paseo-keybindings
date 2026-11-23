// Editing operations for the JSON editor, computed on (value, selection). Pure module (no DOM).
// Each returns a single replacement so the web layer can apply it through execCommand and keep
// the browser's undo stack.

export interface EditResult {
  /** Replace value[start, end) with `insert`. */
  start: number;
  end: number;
  insert: string;
  /** Selection to set after the replacement. */
  selectionStart: number;
  selectionEnd: number;
}

export const INDENT = "  ";

// pos <= 0 short-circuits: lastIndexOf clamps a negative fromIndex to 0 and would match a leading "\n".
const lineStartOf = (value: string, pos: number) => (pos <= 0 ? 0 : value.lastIndexOf("\n", pos - 1) + 1);
const lineEndOf = (value: string, pos: number) => {
  const i = value.indexOf("\n", pos);
  return i === -1 ? value.length : i;
};

/** Line range covered by a selection; a selection ending at a line start excludes that line. */
function coveredLines(value: string, selStart: number, selEnd: number) {
  const start = lineStartOf(value, selStart);
  const lastPos = selEnd > selStart && selEnd === lineStartOf(value, selEnd) ? selEnd - 1 : selEnd;
  const end = lineEndOf(value, lastPos);
  return { start, end, lines: value.slice(start, end).split("\n") };
}

/** Tab / Shift+Tab. */
export function indentSelection(value: string, selStart: number, selEnd: number, outdent = false): EditResult {
  if (!outdent && selStart === selEnd) {
    return { start: selStart, end: selEnd, insert: INDENT, selectionStart: selStart + INDENT.length, selectionEnd: selStart + INDENT.length };
  }
  const { start, end, lines } = coveredLines(value, selStart, selEnd);
  const deltas: number[] = [];
  const changed = lines.map((line) => {
    if (!outdent) {
      deltas.push(INDENT.length);
      return INDENT + line;
    }
    const remove = line.startsWith("\t") ? 1 : (/^ */.exec(line)?.[0].length ?? 0);
    const n = Math.min(remove, line.startsWith("\t") ? 1 : INDENT.length);
    deltas.push(-n);
    return line.slice(n);
  });
  const insert = changed.join("\n");
  const firstDelta = deltas[0];
  const total = deltas.reduce((a, b) => a + b, 0);
  const firstLineStart = start;
  return {
    start,
    end,
    insert,
    selectionStart: Math.max(firstLineStart, selStart + firstDelta),
    selectionEnd: selStart === selEnd ? Math.max(firstLineStart, selEnd + firstDelta) : Math.max(firstLineStart, selEnd + total),
  };
}

/** Enter with auto-indent; splits "{|}" and "[|]" onto three lines. */
export function newlineWithIndent(value: string, selStart: number, selEnd: number): EditResult {
  const lineStart = lineStartOf(value, selStart);
  const indent = /^[ \t]*/.exec(value.slice(lineStart))?.[0] ?? "";
  const before = value.slice(lineStart, selStart).trimEnd().slice(-1);
  const after = value.slice(selEnd).replace(/^[ \t]*/, "")[0];
  const opens = before === "{" || before === "[";
  if (opens && after === (before === "{" ? "}" : "]")) {
    const head = `\n${indent}${INDENT}`;
    const insert = `${head}\n${indent}`;
    // Also swallow spaces between the caret and the closing bracket.
    const end = selEnd + (/^[ \t]*/.exec(value.slice(selEnd))?.[0].length ?? 0);
    return { start: selStart, end, insert, selectionStart: selStart + head.length, selectionEnd: selStart + head.length };
  }
  const insert = `\n${indent}${opens ? INDENT : ""}`;
  return { start: selStart, end: selEnd, insert, selectionStart: selStart + insert.length, selectionEnd: selStart + insert.length };
}

/** Ctrl/Cmd+/: toggles "// " on the covered lines. */
export function toggleLineComment(value: string, selStart: number, selEnd: number): EditResult {
  const { start, end, lines } = coveredLines(value, selStart, selEnd);
  const nonEmpty = lines.filter((line) => line.trim() !== "");
  const allCommented = nonEmpty.length > 0 && nonEmpty.every((line) => line.trimStart().startsWith("//"));
  const minIndent = Math.min(...nonEmpty.map((line) => /^[ \t]*/.exec(line)![0].length), Infinity);
  // Per-line change at absolute offset `at`: remove `removed` chars, insert `inserted` chars.
  const changes: { at: number; removed: number; inserted: number }[] = [];
  let lineOffset = start;
  const changed = lines.map((line) => {
    const lineAt = lineOffset;
    lineOffset += line.length + 1;
    if (line.trim() === "") return line;
    if (allCommented) {
      const match = /^([ \t]*)\/\/ ?/.exec(line)!;
      changes.push({ at: lineAt + match[1].length, removed: match[0].length - match[1].length, inserted: 0 });
      return match[1] + line.slice(match[0].length);
    }
    changes.push({ at: lineAt + minIndent, removed: 0, inserted: 3 });
    return `${line.slice(0, minIndent)}// ${line.slice(minIndent)}`;
  });
  const map = (x: number) => {
    let shift = 0;
    for (const change of changes) {
      if (x <= change.at) break;
      shift += change.inserted - Math.min(change.removed, x - change.at);
    }
    return x + shift;
  };
  return { start, end, insert: changed.join("\n"), selectionStart: map(selStart), selectionEnd: map(selEnd) };
}

// ---------------------------------------------------------------------------
// VS Code line commands, also used by the keybinding commands on any focused input.

/** editor.action.deleteLines: removes the covered lines; the caret keeps its column. */
export function deleteLines(value: string, selStart: number, selEnd: number): EditResult {
  const covered = coveredLines(value, selStart, selEnd);
  let { start, end } = covered;
  if (end < value.length) end += 1;
  else if (start > 0) start -= 1;
  const column = selStart - covered.start;
  const rest = value.slice(0, start) + value.slice(end);
  const lineAt = lineStartOf(rest, start);
  const caret = Math.min(lineAt + column, lineEndOf(rest, lineAt));
  return { start, end, insert: "", selectionStart: caret, selectionEnd: caret };
}

/** editor.action.copyLinesUp/DownAction: duplicates the covered lines; the selection follows the copy below. */
export function copyLines(value: string, selStart: number, selEnd: number, direction: "up" | "down"): EditResult {
  const { start, end } = coveredLines(value, selStart, selEnd);
  const block = value.slice(start, end);
  if (direction === "up") {
    return { start, end: start, insert: `${block}\n`, selectionStart: selStart, selectionEnd: selEnd };
  }
  const shift = block.length + 1;
  return { start: end, end, insert: `\n${block}`, selectionStart: selStart + shift, selectionEnd: selEnd + shift };
}

/** editor.action.moveLinesUp/DownAction: swaps the covered lines with the neighbor line. Null at the edge. */
export function moveLines(value: string, selStart: number, selEnd: number, direction: "up" | "down"): EditResult | null {
  const { start, end } = coveredLines(value, selStart, selEnd);
  const block = value.slice(start, end);
  if (direction === "up") {
    if (start === 0) return null;
    const prevStart = lineStartOf(value, start - 1);
    const prev = value.slice(prevStart, start - 1);
    const shift = -(prev.length + 1);
    return {
      start: prevStart,
      end,
      insert: `${block}\n${prev}`,
      selectionStart: selStart + shift,
      selectionEnd: selEnd + shift,
    };
  }
  if (end === value.length) return null;
  const nextEnd = lineEndOf(value, end + 1);
  const next = value.slice(end + 1, nextEnd);
  const shift = next.length + 1;
  return {
    start,
    end: nextEnd,
    insert: `${next}\n${block}`,
    selectionStart: selStart + shift,
    selectionEnd: selEnd + shift,
  };
}
