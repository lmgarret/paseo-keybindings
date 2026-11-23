// Metadata for commands and when-contexts, shown in the editors and used for validation.

export const COMMAND_CATALOG = [
  { id: "editor.copy", title: "Copy", description: "Copy the selected text (anywhere outside the terminal)" },
  { id: "editor.cut", title: "Cut", description: "Cut the selection in the focused input" },
  { id: "editor.paste", title: "Paste", description: "Paste into the focused input" },
  { id: "editor.selectAll", title: "Select All", description: "Select all text in the focused input" },
  { id: "editor.undo", title: "Undo", description: "Undo in the focused input" },
  { id: "editor.redo", title: "Redo", description: "Redo in the focused input" },
  { id: "cursor.wordLeft", title: "Cursor Word Left", description: "Move to the start of the previous word" },
  { id: "cursor.wordRight", title: "Cursor Word Right", description: "Move to the end of the next word" },
  { id: "cursor.wordLeftSelect", title: "Select Word Left", description: "Extend the selection to the previous word start" },
  { id: "cursor.wordRightSelect", title: "Select Word Right", description: "Extend the selection to the next word end" },
  { id: "cursor.lineStart", title: "Cursor Line Start", description: "Move to the start of the line" },
  { id: "cursor.lineEnd", title: "Cursor Line End", description: "Move to the end of the line" },
  { id: "cursor.lineStartSelect", title: "Select to Line Start", description: "Extend the selection to the line start" },
  { id: "cursor.lineEndSelect", title: "Select to Line End", description: "Extend the selection to the line end" },
  { id: "editor.deleteWordLeft", title: "Delete Word Left", description: "Delete back to the previous word start" },
  { id: "editor.deleteWordRight", title: "Delete Word Right", description: "Delete forward to the next word end" },
  { id: "editor.deleteToLineStart", title: "Delete to Line Start", description: "Delete back to the line start" },
  { id: "editor.deleteToLineEnd", title: "Delete to Line End", description: "Delete forward to the line end" },
  {
    id: "terminal.sendText",
    title: "Terminal: Send Text",
    description: 'Send literal text to the focused terminal. Args: { "text": "\\u0003" }',
    args: { text: "" },
  },
] as const satisfies readonly CommandInfo[];

export interface CommandInfo {
  id: string;
  title: string;
  description: string;
  /** Template for the args property; omitted when the command takes none. */
  args?: Record<string, unknown>;
}

export type CommandId = (typeof COMMAND_CATALOG)[number]["id"];

export const CONTEXT_CATALOG = [
  { name: "terminalFocus", description: "Focus is inside a terminal" },
  { name: "inputFocus", description: "Focus is in an input, textarea, or contenteditable (not a terminal)" },
  { name: "textInputFocus", description: "Focus is in an input or textarea (not a terminal)" },
  { name: "hasSelection", description: "The focused input or the page has selected text" },
  { name: "isMac", description: "The app runs on macOS" },
  { name: "isWindows", description: "The app runs on Windows" },
  { name: "isLinux", description: "The app runs on Linux" },
] as const;

const commandsById = new Map<string, CommandInfo>(COMMAND_CATALOG.map((c) => [c.id, c]));
const contextNames = new Set<string>(CONTEXT_CATALOG.map((c) => c.name));

export const commandInfo = (id: string): CommandInfo | undefined => commandsById.get(id);
export const isKnownContext = (name: string): boolean => contextNames.has(name);
