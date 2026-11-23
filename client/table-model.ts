// Rows of the Keyboard Shortcuts table and the file edits behind each row action. Pure module.
import { COMMAND_CATALOG, commandInfo } from "./catalog";
import type { Keybinding } from "./keybindings";
import { chordsEqual, formatChord, parseChord } from "./keys";
import {
  analyzeUserKeybindings,
  appendBinding,
  removeBinding,
  replaceBinding,
  type TextEdit,
  type UserKeybindings,
} from "./user-bindings";

export interface ShortcutRow {
  id: string;
  command: string;
  title: string;
  /** Normalized key ("" when unbound). */
  key: string;
  when?: string;
  args?: unknown;
  source: "default" | "user" | "unbound";
  /** Index in the user file for user rows. */
  entryIndex?: number;
  /** Other active rows with the same key. */
  conflicts: number;
}

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

/** True when a user "-command" entry removes this default binding. */
export function isDefaultRemoved(binding: Keybinding, userBindings: readonly Keybinding[]): boolean {
  return userBindings.some(
    (u) =>
      u.command === `-${binding.command}` &&
      sameKey(u.key, binding.key) &&
      (u.when === undefined || u.when === binding.when),
  );
}

export function buildRows(defaults: readonly Keybinding[], user: UserKeybindings): ShortcutRow[] {
  const rows: ShortcutRow[] = [];
  defaults.forEach((binding, i) => {
    if (isDefaultRemoved(binding, user.bindings)) return;
    rows.push({
      id: `default-${i}`,
      command: binding.command,
      title: commandInfo(binding.command)?.title ?? binding.command,
      key: normalize(binding.key),
      when: binding.when,
      args: binding.args,
      source: "default",
      conflicts: 0,
    });
  });
  for (const entry of user.entries) {
    const binding = entry.binding;
    if (!binding || binding.command.startsWith("-")) continue;
    rows.push({
      id: `user-${entry.index}`,
      command: binding.command,
      title: commandInfo(binding.command)?.title ?? binding.command,
      key: normalize(binding.key),
      when: binding.when,
      args: binding.args,
      source: "user",
      entryIndex: entry.index,
      conflicts: 0,
    });
  }
  const bound = new Set(rows.map((row) => row.command));
  for (const command of COMMAND_CATALOG) {
    if (!bound.has(command.id)) {
      rows.push({ id: `unbound-${command.id}`, command: command.id, title: command.title, key: "", source: "unbound", conflicts: 0 });
    }
  }
  for (const row of rows) {
    if (row.key) row.conflicts = rows.filter((other) => other !== row && other.key === row.key).length;
  }
  const order = { user: 0, default: 1, unbound: 2 };
  return rows.sort((a, b) => a.title.localeCompare(b.title) || order[a.source] - order[b.source]);
}

/** Filters by free text, or by exact key when `recordedKey` is set ("Record Keys"). */
export function filterRows(rows: readonly ShortcutRow[], query: string, recordedKey?: string): ShortcutRow[] {
  if (recordedKey) return rows.filter((row) => row.key === recordedKey);
  const q = query.trim().toLowerCase();
  if (!q) return [...rows];
  return rows.filter((row) =>
    [row.title, row.command, row.key, row.when ?? "", row.source].some((field) => field.toLowerCase().includes(q)),
  );
}

// ---------------------------------------------------------------------------
// Row actions → edits of the user file

/** Changes a row's key/when/args. Default rows get a user override plus a removal of the default. */
export function editRow(text: string, user: UserKeybindings, row: ShortcutRow, next: Keybinding): TextEdit {
  if (row.source === "user" && row.entryIndex !== undefined) {
    return replaceBinding(text, user.entries[row.entryIndex], next);
  }
  let edit = appendBinding(text, user, next);
  if (row.source === "default") {
    const removal: Keybinding = { key: row.key, command: `-${row.command}` };
    if (row.when !== undefined) removal.when = row.when;
    edit = { ...appendBinding(edit.text, analyzeUserKeybindings(edit.text), removal), range: edit.range };
  }
  return edit;
}

export function addBinding(text: string, user: UserKeybindings, next: Keybinding): TextEdit {
  return appendBinding(text, user, next);
}

/** Removes a user row, or disables a default row with a "-command" entry. */
export function removeRow(text: string, user: UserKeybindings, row: ShortcutRow): TextEdit {
  if (row.source === "user" && row.entryIndex !== undefined) return removeBinding(text, user, row.entryIndex);
  if (row.source === "default") {
    const removal: Keybinding = { key: row.key, command: `-${row.command}` };
    if (row.when !== undefined) removal.when = row.when;
    return appendBinding(text, user, removal);
  }
  return { text };
}

/** Removes every user entry for a command (including removals), restoring its defaults. */
export function resetCommand(text: string, user: UserKeybindings, command: string): TextEdit {
  const indices = user.entries
    .filter((entry) => entry.binding && entry.binding.command.replace(/^-/, "") === command)
    .map((entry) => entry.index)
    .sort((a, b) => b - a);
  let current = text;
  for (const index of indices) {
    current = removeBinding(current, analyzeUserKeybindings(current), index).text;
  }
  return { text: current };
}

export function hasUserEntries(user: UserKeybindings, command: string): boolean {
  return user.entries.some((entry) => entry.binding?.command.replace(/^-/, "") === command);
}
