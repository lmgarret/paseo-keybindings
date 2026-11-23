# paseo-keybindings

A Paseo plugin that remaps keyboard shortcuts in the desktop/web app, VS Code style: a list of
`{ key, command, when, args }` bindings evaluated by one capture-phase `keydown` listener.

The default binding fixes Ctrl+C on macOS when Karabiner-Elements emulates Windows/Linux shortcuts
but leaves raw Ctrl+C to Paseo for the terminal:

```json
{ "key": "ctrl+c", "command": "editor.copy", "when": "!terminalFocus && hasSelection" }
```

- Text selected in chat, the composer, or agent output: Ctrl+C copies it.
- Terminal focused: Ctrl+C is untouched and reaches the shell as SIGINT, selection or not.
- No matching binding: the key flows on exactly as before.

## Install

```bash
npm install
npm run typecheck && npm test
paseo plugin install /absolute/path/to/paseo-keybindings
# after edits
paseo plugin reload paseo-keybindings
```

## Bindings

Bindings live in `client/defaults.ts` (no settings UI yet). Format:

| Field     | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `key`     | `ctrl+c`, `alt+shift+left`, `ctrl++`. Modifiers: `ctrl`, `shift`, `alt`/`option`, `meta`/`cmd`. |
| `command` | A command id below. `-editor.copy` removes earlier bindings of that command for this key. |
| `when`    | Optional clause: context names with `!`, `&&`, `||`, `( )`. Unknown names are false.     |
| `args`    | Optional command arguments.                                                              |

Resolution: the last matching binding wins. If its command declines (for example, copy with
nothing selected), the next match runs; if none handles it, the key is not touched. A handled key
gets `preventDefault()` and `stopPropagation()`.

Letters, digits, and punctuation match by physical key (`event.code`, US positions), so
Alt/Shift/layout do not change them. Named keys: `left right up down home end pageup pagedown
backspace delete enter escape tab space`.

### Contexts

| Context          | True when                                                    |
| ---------------- | ------------------------------------------------------------ |
| `terminalFocus`  | Focus is inside an xterm.js terminal (`.xterm`)              |
| `inputFocus`     | Focus is in an input, textarea, or contenteditable (not terminal) |
| `textInputFocus` | Focus is in an input or textarea (not terminal)              |
| `hasSelection`   | The focused input has a selection, or the page has selected text |
| `isMac`, `isWindows`, `isLinux` | Platform of the app                           |

### Commands

| Command                                                         | Effect                                                    |
| --------------------------------------------------------------- | --------------------------------------------------------- |
| `editor.copy`                                                   | Copy the selection (`execCommand("copy")`, falls back to Paseo `copyText`) |
| `editor.cut`, `editor.paste`, `editor.selectAll`                | Clipboard and select all in the focused input             |
| `editor.undo`, `editor.redo`                                    | Undo/redo in the focused input                            |
| `cursor.wordLeft`, `cursor.wordRight` (+ `Select`)              | Move (or extend selection) by word                        |
| `cursor.lineStart`, `cursor.lineEnd` (+ `Select`)               | Move (or extend selection) to line start/end              |
| `editor.deleteWordLeft`, `editor.deleteWordRight`               | Delete by word                                            |
| `editor.deleteToLineStart`, `editor.deleteToLineEnd`            | Delete to line start/end                                  |
| `terminal.sendText` `{ "text": "\u0003" }`                      | Send literal text/control chars to the focused terminal   |

Input commands only act on a focused input and otherwise let the key through. Edits go through
`execCommand` so they stay on the undo stack and React sees them.

## Limitations

- Desktop and web only. On iOS/Android the plugin is a no-op.
- DOM-level: Paseo has no plugin API for keybindings or for invoking its built-in commands, so
  bindings cannot trigger Paseo shortcuts (planned: v2).
- Electron menu accelerators can consume some keys before the page sees them.
- No `composerFocus` context: the composer has no stable DOM marker to target.
- Single-stroke keys only (no `ctrl+k ctrl+c` chords).
- `terminal.sendText` dispatches an `input` event to xterm's textarea; it relies on xterm internals.

## Development

```text
index.client.tsx       contribute(): installs the listener, returns its cleanup
client/web.ts          only DOM module: listener, contexts, commands (gated on Platform.OS === "web")
client/keys.ts         key string parsing, event normalization
client/when.ts         when-clause compiler
client/keybindings.ts  binding compilation and resolution
client/text-motion.ts  word/line boundaries for inputs
client/defaults.ts     default bindings
test/                  vitest unit tests for the pure modules
```
