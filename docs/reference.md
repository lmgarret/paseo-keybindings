# Reference

## Binding format

```json
{ "key": "ctrl+c", "command": "editor.copy", "when": "!terminalFocus && hasSelection", "args": {} }
```

| Field     | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `key`     | `ctrl+c`, `alt+shift+left`, `ctrl++`. Modifiers: `ctrl`, `shift`, `alt`/`option`, `meta`/`cmd`. |
| `command` | A [command id](#commands), its VS Code id, or a [Paseo action](#paseos-actions). `-editor.copy` removes the default (or Paseo) bindings of that command for this key, never your own. |
| `when`    | Optional clause: [context](#contexts) names with `!`, `&&`, `||`, `( )`. Unknown names are false. |
| `args`    | Optional command arguments.                                                              |

Resolution: the last matching binding wins. If its command declines (for example, copy with
nothing selected), the next match runs; if none handles it, the key is not touched. A handled key
gets `preventDefault()` and `stopPropagation()`.

### Keys

Letters, digits, and punctuation match by physical key (`event.code`, US positions), so
Alt/Shift/layout do not change them. Named keys: `left right up down home end pageup pagedown
backspace delete enter escape tab space`.

## Contexts

Names follow VS Code.

| Context                | True when                                                    |
| ---------------------- | ------------------------------------------------------------ |
| `terminalFocus`        | Focus is inside an xterm.js terminal (`.xterm`)              |
| `terminalTextSelected` | The focused terminal has selected text                       |
| `inputFocus`           | Focus is in an input, textarea, or contenteditable (not terminal) |
| `textInputFocus`       | Focus is in an input or textarea (not terminal)              |
| `hasSelection`, `editorHasSelection` | The focused input has a selection, or the page has selected text |
| `isMac`, `isWindows`, `isLinux` | Platform of the app                                 |
| `isWeb`                | Paseo runs in a browser rather than the desktop app          |

## Commands

Ids follow VS Code naming. The VS Code ids in the last column also work, so bindings copied from a
VS Code `keybindings.json` apply as-is (`terminal.sendText` is kept as an old name of
`terminal.sendSequence`).

| Command | Effect | VS Code id |
| ------- | ------ | ---------- |
| `editor.copy` | Copy the selection (`execCommand("copy")`, falls back to Paseo `copyText`) | `editor.action.clipboardCopyAction` |
| `editor.cut`, `editor.paste` | Cut or paste in the focused input | `editor.action.clipboardCutAction`, `…PasteAction` |
| `editor.selectAll` | Select all in the focused input | `editor.action.selectAll` |
| `editor.undo`, `editor.redo` | Undo/redo in the focused input | `undo`, `redo` |
| `editor.type` `{ "text": "…" }` | Insert text at the cursor | `type` |
| `editor.deleteLines` | Delete the lines the selection covers | `editor.action.deleteLines` |
| `editor.copyLinesUp`, `editor.copyLinesDown` | Duplicate the lines above/below | `editor.action.copyLinesUpAction`, `…DownAction` |
| `editor.moveLinesUp`, `editor.moveLinesDown` | Move the lines up/down | `editor.action.moveLinesUpAction`, `…DownAction` |
| `cursor.wordLeft`, `cursor.wordRight` (+ `Select`) | Move (or extend selection) by word | `cursorWordLeft`, `cursorWordEndRight` (+ `Select`) |
| `cursor.lineStart`, `cursor.lineEnd` (+ `Select`) | Move (or extend selection) to line start/end | `cursorLineStart`/`cursorHome`, `cursorLineEnd`/`cursorEnd` |
| `cursor.top`, `cursor.bottom` (+ `Select`) | Move (or extend selection) to the start/end of the input | `cursorTop`, `cursorBottom` (+ `Select`) |
| `editor.deleteWordLeft`, `editor.deleteWordRight` | Delete by word | `deleteWordLeft`, `deleteWordRight` |
| `editor.deleteToLineStart`, `editor.deleteToLineEnd` | Delete to line start/end | `deleteAllLeft`, `deleteAllRight` |
| `terminal.copySelection` | Copy the terminal selection; lets the key through when nothing is selected | `workbench.action.terminal.copySelection` |
| `terminal.paste` | Paste the clipboard into the terminal (honors bracketed paste) | `workbench.action.terminal.paste` |
| `terminal.sendSequence` `{ "text": "\u0003" }` | Send literal text/control chars to the focused terminal | `workbench.action.terminal.sendSequence` |
| `noop` | Swallow the key, e.g. keep Cmd+W from closing a tab while in the terminal | |

Input commands only act on a focused input and otherwise let the key through. Line commands act on
multi-line inputs (textareas) only. Edits go through `execCommand` so they stay on the undo stack and
React sees them.

## Paseo's actions

Every Paseo shortcut is also a command, under Paseo's action id: `workspace.new`,
`workspace.pane.split.right`, `sidebar.toggle.left`, `command-center.toggle`, `theme.cycle`, … The
composer's actions are `message-input.focus`, `message-input.model-toggle`,
`message-input.mode-cycle`, `message-input.effort-cycle`, `message-input.dictation-toggle`, … The
JSON editor's reference and completion list them all. Two take args:

- `workspace.navigate.index`, `workspace.tab.navigate.index`: `{ "index": 1 }` to `{ "index": 9 }`
- `workspace.navigate.relative`, `workspace.tab.navigate.relative`: `{ "delta": -1 }` or `{ "delta": 1 }`

How they run: Paseo has no plugin API for its actions, so the command presses the action's current
Paseo key (its default, or your rebind from Paseo's settings) on the focused element, and Paseo's own
handler runs it, with its own focus rules. A Paseo action with no key on your platform (unassigned
in Paseo, or a macOS-only shortcut) cannot run.

If a command id is both Paseo's and the plugin's, Paseo's implementation runs when it has a key, and
the plugin's when it has none or Paseo ignores the key.

`-<paseo action>` frees a key from Paseo: while that key is the action's current Paseo key, Paseo
does not see it, and the key reaches the focused element as if unbound. Use `noop` instead to
swallow it entirely.

Moving a Paseo shortcut to another key:

```json
[
  { "key": "cmd+d", "command": "workspace.pane.split.right" },
  { "key": "cmd+\\", "command": "-workspace.pane.split.right" }
]
```

## Precedence

Your bindings run before Paseo's shortcuts: a binding on a Paseo key takes it whenever its `when`
matches and its command does not decline. Keys you did not bind reach Paseo unchanged.

## Examples

Terminal-aware Ctrl+C: copies selected text in chat, the composer, or agent output; in a focused
terminal it reaches the shell as SIGINT, selection or not.

```json
[
  { "key": "ctrl+c", "command": "editor.copy", "when": "!terminalFocus && hasSelection" }
]
```

Windows Terminal-style Ctrl+C/V on macOS:

```json
[
  { "key": "ctrl+c", "command": "terminal.copySelection", "when": "terminalFocus && terminalTextSelected" },
  { "key": "ctrl+v", "command": "terminal.paste", "when": "terminalFocus" }
]
```

Keep Cmd+W from closing the tab while the terminal has focus:

```json
[
  { "key": "cmd+w", "command": "noop", "when": "terminalFocus" }
]
```
