// Rows of the Keyboard Shortcuts table and the file edits behind each row action. Pure module.
import { ALL_COMMANDS, canonicalCommand, commandInfo } from "./catalog";
import type { Keybinding } from "./keybindings";
import { chordsEqual, formatChord, parseChord } from "./keys";
import { NATIVE_SHORTCUTS, type NativeShortcut } from "./native-shortcuts";
import { type AppPlatform, formatStroke, type PaseoOverrides, platformBindings } from "./paseo-actions";
import {
  analyzeUserKeybindings,
  appendBinding,
  removeBinding,
  replaceBinding,
  type TextEdit,
  type UserKeybindings,
} from "./user-bindings";

export type { AppPlatform } from "./paseo-actions";

export interface ShortcutRow {
  id: string;
  /** Command id (aliases resolved). */
  command: string;
  title: string;
  /** Normalized key ("" when unbound). For `digits` rows, the "1" variant. */
  key: string;
  /** The key's last part is a digit and the row covers 1 through 9. */
  digits?: boolean;
  when?: string;
  /** Conditions or state in words ("paseo" rows, whose conditions are not when clauses). */
  note?: string;
  args?: unknown;
  /** "paseo": one of Paseo's built-in bindings, with the user's rebinds from Paseo's settings applied. */
  source: "default" | "user" | "unbound" | "paseo";
  /** Index in the user file for user rows. */
  entryIndex?: number;
  /** Set when the row cannot be changed here (digit ranges and multi-stroke Paseo keys). */
  readOnly?: string;
  /** Titles of the colliding rows. Plugin rows: other plugin rows with the same key. Paseo rows: plugin rows that take its key. */
  conflicts: string[];
  /** Plugin rows: Paseo shortcuts on the same key, which this binding overrides when it runs. */
  shadows: string[];
}

export type RowSource = ShortcutRow["source"];
export const SOURCES: readonly RowSource[] = ["user", "default", "paseo", "unbound"];
const SOURCE_ORDER: Record<RowSource, number> = { user: 0, default: 1, paseo: 2, unbound: 3 };

const normalize = (key: string) => {
  try {
    return formatChord(parseChord(key));
  } catch {
    return key;
  }
};

const sameKey = (a: string, b: string) => {
  try {
    return chordsEqual(parseChord(a), parseChord(b));
  } catch {
    return a === b;
  }
};

/** Every key a row answers to (digit rows cover 1 through 9). */
export function rowKeys(row: Pick<ShortcutRow, "key" | "digits">): string[] {
  if (!row.key) return [];
  if (!row.digits) return [row.key];
  const base = row.key.slice(0, -1);
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => base + d);
}

/** Title for a binding: Paseo's label when its args pick one Paseo binding ("Next workspace"). */
function titleFor(command: string, args: unknown, shortcuts: readonly NativeShortcut[]): string {
  const id = canonicalCommand(command);
  const given = (args ?? {}) as Record<string, unknown>;
  const native = shortcuts.find(
    (s) => s.command === id && s.args && Object.entries(s.args).every(([k, v]) => given[k] === v),
  );
  const index = typeof given.index === "number" ? ` ${given.index}` : "";
  return (native?.label ?? commandInfo(command)?.title ?? command) + index;
}

/** Paseo's bindings on this platform as rows, with the user's Paseo rebinds applied. */
export function nativeRows(platform: AppPlatform, overrides: PaseoOverrides = {}, shortcuts?: readonly NativeShortcut[]): ShortcutRow[] {
  return platformBindings(platform, overrides, shortcuts).map(({ shortcut, strokes, rebound }) => {
    const notes = [shortcut.note, strokes === null ? "unassigned in Paseo" : rebound ? "rebound in Paseo" : undefined];
    const last = strokes?.[strokes.length - 1];
    const row: ShortcutRow = {
      id: `paseo-${shortcut.id}`,
      command: shortcut.command,
      title: shortcut.label,
      key: strokes ? strokes.map(formatStroke).join(" ") : "",
      note: notes.filter(Boolean).join("; ") || undefined,
      source: "paseo",
      conflicts: [],
      shadows: [],
    };
    if (shortcut.args) row.args = { ...shortcut.args };
    if (last?.digits) {
      row.digits = true;
      row.readOnly = "Covers keys 1 to 9: change it in Paseo's Settings → Shortcuts";
    } else if (strokes && strokes.length > 1) {
      row.readOnly = "A multi-stroke key: change it in Paseo's Settings → Shortcuts";
    }
    return row;
  });
}

/** True when a user "-command" entry removes this default (or Paseo) binding. */
export function isDefaultRemoved(binding: Keybinding, userBindings: readonly Keybinding[]): boolean {
  const command = canonicalCommand(binding.command);
  return userBindings.some(
    (u) =>
      u.command.startsWith("-") &&
      canonicalCommand(u.command.slice(1)) === command &&
      sameKey(u.key, binding.key) &&
      (u.when === undefined || u.when === binding.when),
  );
}

export interface PaseoContext {
  platform: AppPlatform;
  overrides?: PaseoOverrides;
  /** Defaults to the generated table; tests pass their own. */
  shortcuts?: readonly NativeShortcut[];
}

/**
 * Rows of the table: defaults, user entries, Paseo's bindings (when `paseo` is given), and every
 * command that has no binding, sorted by title.
 */
export function buildRows(defaults: readonly Keybinding[], user: UserKeybindings, paseo?: PaseoContext): ShortcutRow[] {
  const shortcuts = paseo?.shortcuts ?? NATIVE_SHORTCUTS;
  const plugin: ShortcutRow[] = [];
  defaults.forEach((binding, i) => {
    if (isDefaultRemoved(binding, user.bindings)) return;
    plugin.push({
      id: `default-${i}`,
      command: canonicalCommand(binding.command),
      title: titleFor(binding.command, binding.args, shortcuts),
      key: normalize(binding.key),
      when: binding.when,
      args: binding.args,
      source: "default",
      conflicts: [],
      shadows: [],
    });
  });
  for (const entry of user.entries) {
    const binding = entry.binding;
    if (!binding || binding.command.startsWith("-")) continue;
    plugin.push({
      id: `user-${entry.index}`,
      command: canonicalCommand(binding.command),
      title: titleFor(binding.command, binding.args, shortcuts),
      key: normalize(binding.key),
      when: binding.when,
      args: binding.args,
      source: "user",
      entryIndex: entry.index,
      conflicts: [],
      shadows: [],
    });
  }
  for (const row of plugin) {
    if (row.key) row.conflicts = plugin.filter((other) => other !== row && other.key === row.key).map((other) => other.title);
  }

  // A Paseo row is hidden when the user removed it, or binds the same command to the same key.
  const native = paseo
    ? nativeRows(paseo.platform, paseo.overrides, shortcuts).filter(
        (row) =>
          !row.key ||
          !(
            isDefaultRemoved({ key: row.key, command: row.command }, user.bindings) ||
            plugin.some((p) => p.command === row.command && p.key === row.key && !p.when)
          ),
      )
    : [];
  for (const nativeRow of native) {
    const keys = rowKeys(nativeRow);
    for (const row of plugin) {
      if (!row.key || row.command === nativeRow.command || !keys.includes(row.key)) continue;
      nativeRow.conflicts.push(row.title);
      if (!row.shadows.includes(nativeRow.title)) row.shadows.push(nativeRow.title);
    }
  }

  const rows = [...plugin, ...native];
  const listed = new Set(rows.map((row) => row.command));
  for (const command of ALL_COMMANDS) {
    if (listed.has(command.id)) continue;
    // Without a platform we cannot tell whether Paseo has a key for it, so say nothing.
    const note = paseo && command.paseo && !command.plugin ? "Paseo has no key for this here, so it cannot run" : undefined;
    rows.push({
      id: `unbound-${command.id}`,
      command: command.id,
      title: command.title,
      key: "",
      note,
      source: "unbound",
      conflicts: [],
      shadows: [],
    });
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source]);
}

/** Field filters in a search query, VS Code style: `@source:user`, `@command:copy`, `@keybinding:ctrl`, `@when:focus`. */
const FIELD_ALIASES: Record<string, "source" | "command" | "key" | "when"> = {
  source: "source",
  command: "command",
  keybinding: "key",
  key: "key",
  when: "when",
};
const FIELD_TOKEN = /(^|\s)@(\w+):(\S*)/g;

export interface ParsedQuery {
  /** Values per field; values of one field are alternatives, fields must all match. */
  fields: Partial<Record<"source" | "command" | "key" | "when", string[]>>;
  /** What is left once field filters are taken out, matched against every column. */
  text: string;
}

export function parseQuery(query: string): ParsedQuery {
  const fields: ParsedQuery["fields"] = {};
  const text = query.replace(FIELD_TOKEN, (token, lead: string, name: string, value: string) => {
    const field = FIELD_ALIASES[name.toLowerCase()];
    if (!field) return token;
    if (value) (fields[field] ??= []).push(value.toLowerCase());
    return lead;
  });
  return { fields, text: text.replace(/\s+/g, " ").trim().toLowerCase() };
}

/** Adds or removes `@source:<source>` in a query (the source toggles above the table). */
export function toggleSourceFilter(query: string, source: RowSource): string {
  const active = parseQuery(query).fields.source?.includes(source);
  if (active) {
    const pattern = new RegExp(`(^|\\s)@source:${source}(?=\\s|$)`, "gi");
    return query.replace(pattern, "").replace(/\s+/g, " ").trim();
  }
  return `@source:${source} ${query.trim()}`.trim();
}

const condition = (row: ShortcutRow) => row.when ?? row.note ?? "";

/**
 * Filters by query (free text plus `@field:value` filters), or by exact key when `keys` is set
 * ("Record Keys", or the keys of a row whose collisions are shown): rows answering to any of them.
 */
export function filterRows(rows: readonly ShortcutRow[], query: string, keys?: string | readonly string[]): ShortcutRow[] {
  const wanted = typeof keys === "string" ? [keys] : keys;
  if (wanted?.length) return rows.filter((row) => rowKeys(row).some((key) => wanted.includes(key)));
  const { fields, text } = parseQuery(query);
  const has = (value: string, wanted: string[] | undefined) => !wanted || wanted.some((w) => value.toLowerCase().includes(w));
  return rows.filter(
    (row) =>
      has(row.source, fields.source) &&
      (!fields.command || fields.command.some((w) => row.command.toLowerCase().includes(w) || row.title.toLowerCase().includes(w))) &&
      has(row.key, fields.key) &&
      has(condition(row), fields.when) &&
      (!text ||
        [row.title, row.command, row.key, row.when ?? "", row.note ?? "", row.source].some((field) =>
          field.toLowerCase().includes(text),
        )),
  );
}

export type SortColumn = "command" | "key" | "when" | "source";
export interface SortOrder {
  column: SortColumn;
  descending?: boolean;
}

/** Sorts by a column; rows with an empty cell stay last either way, ties fall back to the title. */
export function sortRows(rows: readonly ShortcutRow[], order: SortOrder): ShortcutRow[] {
  const value = (row: ShortcutRow): string | number =>
    order.column === "command"
      ? row.title
      : order.column === "key"
        ? row.key
        : order.column === "when"
          ? condition(row)
          : SOURCE_ORDER[row.source];
  const sign = order.descending ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === "" || vb === "") {
      if (va !== vb) return va === "" ? 1 : -1;
    } else {
      const byColumn = typeof va === "number" ? va - (vb as number) : va.localeCompare(vb as string);
      if (byColumn !== 0) return sign * byColumn;
    }
    return a.title.localeCompare(b.title) || SOURCE_ORDER[a.source] - SOURCE_ORDER[b.source];
  });
}

// ---------------------------------------------------------------------------
// Row actions → edits of the user file

/**
 * Changes a row's key/when/args. Default and Paseo rows get a user binding plus a "-command" entry
 * that removes the old key (for Paseo rows, the plugin then keeps that key from Paseo).
 */
export function editRow(text: string, user: UserKeybindings, row: ShortcutRow, next: Keybinding): TextEdit {
  if (row.source === "user" && row.entryIndex !== undefined) {
    return dropRedundantRemovals(replaceBinding(text, user.entries[row.entryIndex], next), next);
  }
  const unchanged =
    row.key && sameKey(next.key, row.key) && next.when === row.when && JSON.stringify(next.args) === JSON.stringify(row.args);
  if ((row.source === "default" || row.source === "paseo") && unchanged) return { text };
  let edit = appendBinding(text, user, next);
  if ((row.source === "default" || row.source === "paseo") && row.key) {
    edit = { ...appendBinding(edit.text, analyzeUserKeybindings(edit.text), removalFor(row)), range: edit.range };
  }
  return edit;
}

export function addBinding(text: string, user: UserKeybindings, next: Keybinding): TextEdit {
  return dropRedundantRemovals(appendBinding(text, user, next), next);
}

/**
 * Drops "-command" entries for the key a binding now uses for the same command (left over from an
 * earlier change away from that key), so the file says what the table shows.
 */
function dropRedundantRemovals(edit: TextEdit, binding: Keybinding): TextEdit {
  const command = canonicalCommand(binding.command);
  let current = edit;
  for (;;) {
    const user = analyzeUserKeybindings(current.text);
    const stale = user.entries.find(
      (entry) =>
        entry.binding?.command.startsWith("-") &&
        canonicalCommand(entry.binding.command.slice(1)) === command &&
        entry.binding.when === undefined &&
        sameKey(entry.binding.key, binding.key),
    );
    if (!stale) return current;
    const text = removeBinding(current.text, user, stale.index).text;
    // Keep the range on the edited entry when the removal came before it.
    const shift = current.range && stale.start < current.range.start ? current.text.length - text.length : 0;
    current = { text, range: current.range && { start: current.range.start - shift, end: current.range.end - shift } };
  }
}

function removalFor(row: ShortcutRow): Keybinding {
  const removal: Keybinding = { key: row.key, command: `-${row.command}` };
  if (row.when !== undefined) removal.when = row.when;
  return removal;
}

/** Removes a user row, or disables a default or Paseo row with a "-command" entry. */
export function removeRow(text: string, user: UserKeybindings, row: ShortcutRow): TextEdit {
  if (row.source === "user" && row.entryIndex !== undefined) return removeBinding(text, user, row.entryIndex);
  if ((row.source === "default" || row.source === "paseo") && row.key) return appendBinding(text, user, removalFor(row));
  return { text };
}

/** Removes every user entry for a command (including removals), restoring its defaults. */
export function resetCommand(text: string, user: UserKeybindings, command: string): TextEdit {
  const indices = user.entries
    .filter((entry) => entry.binding && canonicalCommand(entry.binding.command.replace(/^-/, "")) === command)
    .map((entry) => entry.index)
    .sort((a, b) => b - a);
  let current = text;
  for (const index of indices) {
    current = removeBinding(current, analyzeUserKeybindings(current), index).text;
  }
  return { text: current };
}

export function hasUserEntries(user: UserKeybindings, command: string): boolean {
  return user.entries.some((entry) => !!entry.binding && canonicalCommand(entry.binding.command.replace(/^-/, "")) === command);
}
