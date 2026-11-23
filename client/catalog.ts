// Metadata for commands and when-contexts, shown in the editors and used for validation.
//
// Two kinds of commands share one namespace:
// - COMMAND_CATALOG: implemented by the plugin. They act on focused text, the terminal, or keys.
//   Ids follow VS Code naming; `aliases` lists the matching VS Code ids (and legacy ids), so
//   bindings pasted from a VS Code keybindings.json work as-is.
// - PASEO_COMMANDS: Paseo's built-in actions under Paseo's own ids, generated from
//   native-shortcuts.ts. The plugin runs them by pressing their current Paseo key.
// When an id is in both, Paseo's implementation runs when it has a key, and the plugin's otherwise.
import { NATIVE_SHORTCUTS } from "./native-shortcuts";

export const COMMAND_CATALOG = [
  {
    id: "editor.copy",
    title: "Copy",
    description: "Copy the selected text (anywhere outside the terminal)",
    aliases: ["editor.action.clipboardCopyAction"],
  },
  {
    id: "editor.cut",
    title: "Cut",
    description: "Cut the selection in the focused input",
    aliases: ["editor.action.clipboardCutAction"],
  },
  {
    id: "editor.paste",
    title: "Paste",
    description: "Paste into the focused input",
    aliases: ["editor.action.clipboardPasteAction"],
  },
  {
    id: "editor.selectAll",
    title: "Select All",
    description: "Select all text in the focused input",
    aliases: ["editor.action.selectAll"],
  },
  { id: "editor.undo", title: "Undo", description: "Undo in the focused input", aliases: ["undo"] },
  { id: "editor.redo", title: "Redo", description: "Redo in the focused input", aliases: ["redo"] },
  {
    id: "editor.type",
    title: "Type",
    description: 'Insert text at the cursor in the focused input. Args: { "text": "..." }',
    aliases: ["type"],
    args: { text: "" },
  },
  {
    id: "editor.deleteLines",
    title: "Delete Line",
    description: "Delete the lines covered by the selection",
    aliases: ["editor.action.deleteLines"],
  },
  {
    id: "editor.copyLinesUp",
    title: "Copy Line Up",
    description: "Duplicate the selected lines above",
    aliases: ["editor.action.copyLinesUpAction"],
  },
  {
    id: "editor.copyLinesDown",
    title: "Copy Line Down",
    description: "Duplicate the selected lines below",
    aliases: ["editor.action.copyLinesDownAction"],
  },
  {
    id: "editor.moveLinesUp",
    title: "Move Line Up",
    description: "Move the selected lines up one line",
    aliases: ["editor.action.moveLinesUpAction"],
  },
  {
    id: "editor.moveLinesDown",
    title: "Move Line Down",
    description: "Move the selected lines down one line",
    aliases: ["editor.action.moveLinesDownAction"],
  },
  {
    id: "cursor.wordLeft",
    title: "Cursor Word Left",
    description: "Move to the start of the previous word",
    aliases: ["cursorWordLeft", "cursorWordStartLeft"],
  },
  {
    id: "cursor.wordRight",
    title: "Cursor Word Right",
    description: "Move to the end of the next word",
    aliases: ["cursorWordEndRight"],
  },
  {
    id: "cursor.wordLeftSelect",
    title: "Select Word Left",
    description: "Extend the selection to the previous word start",
    aliases: ["cursorWordLeftSelect", "cursorWordStartLeftSelect"],
  },
  {
    id: "cursor.wordRightSelect",
    title: "Select Word Right",
    description: "Extend the selection to the next word end",
    aliases: ["cursorWordEndRightSelect"],
  },
  {
    id: "cursor.lineStart",
    title: "Cursor Line Start",
    description: "Move to the start of the line",
    aliases: ["cursorLineStart", "cursorHome"],
  },
  {
    id: "cursor.lineEnd",
    title: "Cursor Line End",
    description: "Move to the end of the line",
    aliases: ["cursorLineEnd", "cursorEnd"],
  },
  {
    id: "cursor.lineStartSelect",
    title: "Select to Line Start",
    description: "Extend the selection to the line start",
    aliases: ["cursorHomeSelect"],
  },
  {
    id: "cursor.lineEndSelect",
    title: "Select to Line End",
    description: "Extend the selection to the line end",
    aliases: ["cursorEndSelect"],
  },
  { id: "cursor.top", title: "Cursor Top", description: "Move to the start of the input", aliases: ["cursorTop"] },
  { id: "cursor.bottom", title: "Cursor Bottom", description: "Move to the end of the input", aliases: ["cursorBottom"] },
  {
    id: "cursor.topSelect",
    title: "Select to Top",
    description: "Extend the selection to the start of the input",
    aliases: ["cursorTopSelect"],
  },
  {
    id: "cursor.bottomSelect",
    title: "Select to Bottom",
    description: "Extend the selection to the end of the input",
    aliases: ["cursorBottomSelect"],
  },
  {
    id: "editor.deleteWordLeft",
    title: "Delete Word Left",
    description: "Delete back to the previous word start",
    aliases: ["deleteWordLeft"],
  },
  {
    id: "editor.deleteWordRight",
    title: "Delete Word Right",
    description: "Delete forward to the next word end",
    aliases: ["deleteWordRight"],
  },
  {
    id: "editor.deleteToLineStart",
    title: "Delete to Line Start",
    description: "Delete back to the line start",
    aliases: ["deleteAllLeft"],
  },
  {
    id: "editor.deleteToLineEnd",
    title: "Delete to Line End",
    description: "Delete forward to the line end",
    aliases: ["deleteAllRight"],
  },
  {
    id: "terminal.copySelection",
    title: "Terminal: Copy Selection",
    description: "Copy the terminal selection; lets the key through when nothing is selected",
    aliases: ["workbench.action.terminal.copySelection"],
  },
  {
    id: "terminal.paste",
    title: "Terminal: Paste",
    description: "Paste the clipboard into the focused terminal (bracketed paste aware)",
    aliases: ["workbench.action.terminal.paste"],
  },
  {
    id: "terminal.sendSequence",
    title: "Terminal: Send Sequence",
    description: 'Send literal text to the focused terminal. Args: { "text": "\\u0003" }',
    aliases: ["workbench.action.terminal.sendSequence", "terminal.sendText"],
    args: { text: "" },
  },
  {
    id: "noop",
    title: "No Operation",
    description: "Swallow the key so neither Paseo nor the focused element sees it",
  },
] as const satisfies readonly CommandInfo[];

export interface CommandInfo {
  id: string;
  title: string;
  description: string;
  /** Other ids accepted for this command (VS Code ids, legacy ids). */
  aliases?: readonly string[];
  /** Template for the args property; omitted when the command takes none. */
  args?: Record<string, unknown>;
  /** Paseo implements this command (it runs Paseo's action when that has a key). */
  paseo?: boolean;
  /** The plugin implements this command. */
  plugin?: boolean;
}

function paseoCommands(): CommandInfo[] {
  const byId = new Map<string, { labels: string[]; digits: boolean; delta: boolean }>();
  for (const shortcut of NATIVE_SHORTCUTS) {
    const entry = byId.get(shortcut.command) ?? { labels: [], digits: false, delta: false };
    if (!entry.labels.includes(shortcut.label)) entry.labels.push(shortcut.label);
    if (shortcut.combo.endsWith("+Digit")) entry.digits = true;
    if (shortcut.args && "delta" in shortcut.args) entry.delta = true;
    byId.set(shortcut.command, entry);
  }
  return [...byId].map(([id, { labels, digits, delta }]) => {
    const info: CommandInfo = {
      id,
      title: labels.join(" / "),
      description: `Paseo: ${labels.join(" / ")}${digits ? ' (args { "index": 1-9 })' : delta ? ' (args { "delta": -1 or 1 })' : ""}`,
      paseo: true,
    };
    if (digits) info.args = { index: 1 };
    if (delta) info.args = { delta: 1 };
    return info;
  });
}

/** Paseo's built-in actions as commands. */
export const PASEO_COMMANDS: readonly CommandInfo[] = paseoCommands();

/** Every command: the plugin's, then Paseo's. An id in both is listed once, with both flags. */
export const ALL_COMMANDS: readonly CommandInfo[] = (() => {
  const merged = new Map<string, CommandInfo>();
  for (const command of COMMAND_CATALOG as readonly CommandInfo[]) merged.set(command.id, { ...command, plugin: true });
  for (const command of PASEO_COMMANDS) {
    const own = merged.get(command.id);
    merged.set(command.id, own ? { ...own, paseo: true, args: own.args ?? command.args } : command);
  }
  return [...merged.values()];
})();

export type CommandId = (typeof COMMAND_CATALOG)[number]["id"];

export const CONTEXT_CATALOG = [
  { name: "terminalFocus", description: "Focus is inside a terminal" },
  { name: "terminalTextSelected", description: "The focused terminal has selected text" },
  { name: "inputFocus", description: "Focus is in an input, textarea, or contenteditable (not a terminal)" },
  { name: "textInputFocus", description: "Focus is in an input or textarea (not a terminal)" },
  { name: "hasSelection", description: "The focused input or the page has selected text" },
  { name: "editorHasSelection", description: "Same as hasSelection" },
  { name: "isMac", description: "The app runs on macOS" },
  { name: "isWindows", description: "The app runs on Windows" },
  { name: "isLinux", description: "The app runs on Linux" },
  { name: "isWeb", description: "The app runs in a browser rather than the desktop app" },
] as const;

const commandsById = new Map<string, CommandInfo>();
for (const command of ALL_COMMANDS) {
  commandsById.set(command.id, command);
  for (const alias of command.aliases ?? []) commandsById.set(alias, command);
}
const contextNames = new Set<string>(CONTEXT_CATALOG.map((c) => c.name));

/** Looks up a command by id or alias. */
export const commandInfo = (id: string): CommandInfo | undefined => commandsById.get(id);

/** The catalog id for an id or alias; unknown ids are returned unchanged. */
export const canonicalCommand = (id: string): string => commandsById.get(id)?.id ?? id;

export const isKnownContext = (name: string): boolean => contextNames.has(name);
