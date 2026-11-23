// The user's keybindings.json: validation with source ranges, and text edits that keep the rest
// of the file (comments, formatting) intact. Pure module (no DOM).
import { commandInfo, isKnownContext } from "./catalog";
import { type JsonNode, parse, toValue } from "./jsonc";
import type { Keybinding } from "./keybindings";
import { parseChord } from "./keys";
import { compileWhen, whenIdentifiers } from "./when";

export const NEW_FILE_TEMPLATE = `// Place your key bindings in this file to override the defaults.
// Later entries win. Prefix a command with "-" to remove a default binding.
[
]
`;

export interface Diagnostic {
  start: number;
  end: number;
  severity: "error" | "warning";
  message: string;
}

export interface UserEntry {
  index: number;
  start: number;
  end: number;
  /** Set when the entry is valid enough to run. */
  binding?: Keybinding;
}

export interface UserKeybindings {
  /** False when the file cannot be edited structurally (syntax error, not an array). */
  editable: boolean;
  array?: Extract<JsonNode, { type: "array" }>;
  entries: UserEntry[];
  bindings: Keybinding[];
  diagnostics: Diagnostic[];
}

const KNOWN_PROPERTIES = new Set(["key", "command", "when", "args"]);

export function analyzeUserKeybindings(text: string): UserKeybindings {
  const parsed = parse(text);
  const diagnostics: Diagnostic[] = [];
  if (parsed.error) {
    return {
      editable: false,
      entries: [],
      bindings: [],
      diagnostics: [{ ...parsed.error, severity: "error" }],
    };
  }
  const root = parsed.root;
  if (!root) return { editable: true, entries: [], bindings: [], diagnostics };
  if (root.type !== "array") {
    return {
      editable: false,
      entries: [],
      bindings: [],
      diagnostics: [{ start: root.start, end: root.end, severity: "error", message: "Expected an array of keybindings" }],
    };
  }

  const entries: UserEntry[] = [];
  const bindings: Keybinding[] = [];
  root.items.forEach((item, index) => {
    const entry: UserEntry = { index, start: item.start, end: item.end };
    entries.push(entry);
    const errorCount = diagnostics.length;
    const error = (start: number, end: number, message: string) =>
      diagnostics.push({ start, end, severity: "error", message });
    const warn = (start: number, end: number, message: string) =>
      diagnostics.push({ start, end, severity: "warning", message });

    if (item.type !== "object") {
      error(item.start, item.end, "Expected a keybinding object");
      return;
    }
    const props = new Map(item.properties.map((p) => [p.key, p]));
    for (const p of item.properties) {
      if (!KNOWN_PROPERTIES.has(p.key)) warn(p.keyStart, p.keyEnd, `Unknown property "${p.key}"`);
    }

    const key = props.get("key");
    if (!key) error(item.start, item.start + 1, 'Missing property "key"');
    else if (key.value.type !== "string") error(key.value.start, key.value.end, '"key" must be a string');
    else {
      try {
        parseChord(key.value.value);
      } catch (e) {
        error(key.value.start, key.value.end, (e as Error).message);
      }
    }

    const command = props.get("command");
    if (!command) error(item.start, item.start + 1, 'Missing property "command"');
    else if (command.value.type !== "string") error(command.value.start, command.value.end, '"command" must be a string');
    else {
      const id = command.value.value.replace(/^-/, "");
      if (!commandInfo(id)) warn(command.value.start, command.value.end, `Unknown command "${id}"`);
    }

    const when = props.get("when");
    if (when) {
      if (when.value.type !== "string") error(when.value.start, when.value.end, '"when" must be a string');
      else {
        const clause = when.value.value;
        try {
          compileWhen(clause);
          for (const ident of whenIdentifiers(clause)) {
            if (!isKnownContext(ident.name)) {
              const at = when.value.start + 1 + ident.start;
              warn(at, at + ident.name.length, `Unknown context "${ident.name}" (always false)`);
            }
          }
        } catch (e) {
          error(when.value.start, when.value.end, (e as Error).message);
        }
      }
    }

    const args = props.get("args");
    if (
      command?.value.type === "string" &&
      command.value.value === "terminal.sendText" &&
      (args?.value.type !== "object" || !args.value.properties.some((p) => p.key === "text" && p.value.type === "string"))
    ) {
      warn((args ?? command).value.start, (args ?? command).value.end, 'terminal.sendText needs args { "text": "..." }');
    }

    if (diagnostics.slice(errorCount).some((d) => d.severity === "error")) return;
    const binding: Keybinding = {
      key: (key!.value as { value: string }).value,
      command: (command!.value as { value: string }).value,
    };
    if (when) binding.when = (when.value as { value: string }).value;
    if (args) binding.args = toValue(args.value);
    entry.binding = binding;
    bindings.push(binding);
  });

  return { editable: true, array: root, entries, bindings, diagnostics };
}

// ---------------------------------------------------------------------------
// Text edits

export function serializeBinding(binding: Keybinding, indent = "  ", unit = "  "): string {
  const inner = indent + unit;
  const lines = [`${inner}"key": ${JSON.stringify(binding.key)}`, `${inner}"command": ${JSON.stringify(binding.command)}`];
  if (binding.when !== undefined && binding.when !== "") lines.push(`${inner}"when": ${JSON.stringify(binding.when)}`);
  if (binding.args !== undefined) {
    const args = JSON.stringify(binding.args, null, unit).replace(/\n/g, `\n${inner}`);
    lines.push(`${inner}"args": ${args}`);
  }
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

export interface TextEdit {
  text: string;
  /** Range of the inserted or replaced entry in the new text. */
  range?: { start: number; end: number };
}

const lineStartOf = (text: string, offset: number) => text.lastIndexOf("\n", offset - 1) + 1;
const onlyWhitespaceBefore = (text: string, offset: number) => /^[ \t]*$/.test(text.slice(lineStartOf(text, offset), offset));

/** Appends a binding to the array, creating the file content if needed. */
export function appendBinding(text: string, analysis: UserKeybindings, binding: Keybinding): TextEdit {
  if (!analysis.editable) throw new Error("Fix the errors in keybindings.json first");
  const entry = serializeBinding(binding);
  const array = analysis.array;
  if (!array) {
    const base = text.trim() === "" ? "" : text.replace(/\s*$/, "\n");
    const prefix = base === "" ? NEW_FILE_TEMPLATE.slice(0, NEW_FILE_TEMPLATE.lastIndexOf("[")) : base;
    const head = `${prefix}[\n  `;
    return { text: `${head}${entry}\n]\n`, range: { start: head.length, end: head.length + entry.length } };
  }
  const last = array.items.length - 1;
  let at: number;
  let insert: string;
  if (last < 0) {
    // Replace the inside of "[ ]" (whitespace only, or comments that we keep).
    at = array.end - 1;
    const inside = text.slice(array.start + 1, at);
    const lead = inside.trim() === "" ? "" : inside.replace(/\s*$/, "");
    const head = `${lead}\n  `;
    const newText = `${text.slice(0, array.start + 1)}${head}${entry}\n${text.slice(at)}`;
    const start = array.start + 1 + head.length;
    return { text: newText, range: { start, end: start + entry.length } };
  }
  const separator = array.separators[last];
  if (separator !== undefined) {
    at = separator;
    insert = "\n  ";
  } else {
    at = array.items[last].end;
    insert = ",\n  ";
  }
  const start = at + insert.length;
  return { text: text.slice(0, at) + insert + entry + text.slice(at), range: { start, end: start + entry.length } };
}

export function replaceBinding(text: string, entry: UserEntry, binding: Keybinding): TextEdit {
  const indent = onlyWhitespaceBefore(text, entry.start) ? text.slice(lineStartOf(text, entry.start), entry.start) : "  ";
  const serialized = serializeBinding(binding, indent);
  return {
    text: text.slice(0, entry.start) + serialized + text.slice(entry.end),
    range: { start: entry.start, end: entry.start + serialized.length },
  };
}

export function removeBinding(text: string, analysis: UserKeybindings, index: number): TextEdit {
  const array = analysis.array;
  if (!analysis.editable || !array) throw new Error("Fix the errors in keybindings.json first");
  const items = array.items;
  const item = items[index];
  let start: number;
  let end: number;
  if (index < items.length - 1) {
    const next = items[index + 1];
    start = onlyWhitespaceBefore(text, item.start) ? lineStartOf(text, item.start) : item.start;
    end = onlyWhitespaceBefore(text, next.start) ? lineStartOf(text, next.start) : next.start;
  } else if (index > 0) {
    start = items[index - 1].end;
    end = item.end;
  } else {
    start = onlyWhitespaceBefore(text, item.start) ? lineStartOf(text, item.start) : item.start;
    end = array.separators[index] ?? item.end;
    const rest = /^[ \t]*\n/.exec(text.slice(end));
    if (rest && start === lineStartOf(text, start)) end += rest[0].length;
  }
  return { text: text.slice(0, start) + text.slice(end) };
}
