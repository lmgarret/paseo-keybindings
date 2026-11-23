<p align="center"><img src="assets/icon.svg" width="112" alt="Keybindings logo"></p>

<h1 align="center">Keybindings</h1>

A Paseo plugin that remaps keyboard shortcuts in the desktop/web app, VS Code style: one
`keybindings.json` of `{ key, command, when, args }` bindings for the plugin's commands (text
editing, terminal keys) and Paseo's own actions (workspaces, panes, tabs, sidebars, composer).

No bindings ship by default: until you add some to `keybindings.json`, every key behaves as before.

Rebinding a Paseo shortcut works as in VS Code, with a binding for the new key and a `-command`
entry that frees the old one:

```json
[
  { "key": "cmd+d", "command": "workspace.pane.split.right" },
  { "key": "cmd+\\", "command": "-workspace.pane.split.right" }
]
```

Example: terminal-aware Ctrl+C on macOS when Karabiner-Elements emulates Windows/Linux shortcuts
but leaves raw Ctrl+C to Paseo for the terminal:

```json
[
  { "key": "ctrl+c", "command": "editor.copy", "when": "!terminalFocus && hasSelection" }
]
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

## Editing bindings

Your bindings live in `<paseo home>/keybindings.json` (`~/.paseo/keybindings.json` by default) on
the daemon host, layered after the code defaults in `client/defaults.ts` (empty). Changes apply live, with no
reload, whether they come from the UI or from another editor.

Open them from the Command Center (Cmd/Ctrl+K):

- **Preferences: Open Keyboard Shortcuts**: a table of every command with its keybinding, `when`,
  and source (Default/User/Paseo). Search by text or with **Record Keys**. Each row can be changed,
  added, removed, reset, or shown in the JSON. The dialog records keys (press the combination, then
  Enter) and checks the `when` clause as you type. Editing a Default or Paseo row adds a user binding
  plus a `-command` entry that frees the old key. Also under Settings, Plugins.

  **Paseo** rows are Paseo's shortcuts for your platform, with the rebinds saved in Paseo's
  Settings → Shortcuts applied. Rows covering a digit range (jump to workspace 1–9) or a multi-stroke
  key are read-only here. A binding on a Paseo key shows **Overrides Paseo: …**, and the Paseo row
  **Overridden by N bindings**.
- **Preferences: Open Keyboard Shortcuts (JSON)**: an editor for `keybindings.json` with syntax
  highlighting, line numbers, problems (syntax errors, invalid keys or `when` clauses, unknown
  commands or contexts) with jump-to-line, completion for commands, contexts, and property names
  (Ctrl+Space), Tab/Shift+Tab indent, auto-indent, Cmd/Ctrl+/ comments, Shift+Alt+F format (keeps
  comments), Cmd/Ctrl+S save, and a commands/contexts reference that appends bindings. Saves are
  compare-and-swap: if the file changed on disk, you choose which version to keep.

The file is JSON with comments and trailing commas. Entries with errors are skipped and the rest
still apply.

## Binding format

| Field     | Meaning                                                                                  |
| --------- | ---------------------------------------------------------------------------------------- |
| `key`     | `ctrl+c`, `alt+shift+left`, `ctrl++`. Modifiers: `ctrl`, `shift`, `alt`/`option`, `meta`/`cmd`. |
| `command` | A command id below, or its VS Code id. `-editor.copy` removes the default (or Paseo) bindings of that command for this key, never your own. |
| `when`    | Optional clause: context names with `!`, `&&`, `||`, `( )`. Unknown names are false.     |
| `args`    | Optional command arguments.                                                              |

Resolution: the last matching binding wins. If its command declines (for example, copy with
nothing selected), the next match runs; if none handles it, the key is not touched. A handled key
gets `preventDefault()` and `stopPropagation()`.

Letters, digits, and punctuation match by physical key (`event.code`, US positions), so
Alt/Shift/layout do not change them. Named keys: `left right up down home end pageup pagedown
backspace delete enter escape tab space`.

### Contexts

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

### Commands

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

### Paseo's actions

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

### Precedence

Your bindings run before Paseo's shortcuts: a binding on a Paseo key takes it whenever its `when`
matches and its command does not decline. Keys you did not bind reach Paseo unchanged.

Example, Windows Terminal-style Ctrl+C/V on macOS:

```json
[
  { "key": "ctrl+c", "command": "terminal.copySelection", "when": "terminalFocus && terminalTextSelected" },
  { "key": "ctrl+v", "command": "terminal.paste", "when": "terminalFocus" }
]
```

Input commands only act on a focused input and otherwise let the key through. Line commands act on
multi-line inputs (textareas) only. Edits go through `execCommand` so they stay on the undo stack and
React sees them.

## Limitations

- Desktop and web only. On iOS/Android the plugin is a no-op.
- Paseo has no plugin API for keybindings or its actions, so the Paseo integration relies on its
  internals. If a Paseo update changes them, the plugin degrades rather than breaking keys:
  - Running before Paseo: Paseo's keydown listener starts with a `document.visibilityState` check.
    The plugin shadows that getter on `document`, and during a keydown (`window.event`) runs its
    bindings there, answering `"hidden"` when one took the key. If Paseo stops reading it, Paseo's
    keys win again.
  - Running Paseo's actions: synthetic key events, which Paseo's handler accepts, built from the
    action list in `client/native-shortcuts.ts` (extracted from the app, see Development).
  - Your Paseo rebinds: read from Paseo's storage (`@paseo:keyboard-shortcut-overrides`) at each
    keypress, so changes in Paseo's settings apply at once. The table reads them when it opens.
- `terminalTextSelected` and `terminal.copySelection` read the selection through xterm's copy
  handler, and `terminal.paste` goes through its paste handler. There is no `terminal.selectAll`:
  xterm offers no DOM hook for it.
- Electron menu accelerators can consume some keys before the page sees them.
- No `composerFocus` context: the composer has no stable DOM marker to target. Paseo's composer
  actions still apply Paseo's own focus rules.
- Single-stroke keys only (no `ctrl+k ctrl+c` chords).
- The JSON editor is a plugin screen, not Paseo's file tab, which only opens workspace files. On
  iOS/Android it is a plain text field (no highlighting, completion, or key recording).
- The file lives on the daemon host, so each host has its own bindings.
- `terminal.sendSequence` dispatches an `input` event to xterm's textarea; it relies on xterm internals.

## Development

```text
index.client.tsx       listener, live user bindings, screens, Command Center items
index.server.ts        keybindings.read / keybindings.write / keybindings.watch
server/store.ts        file read, compare-and-swap write, directory watch
shared/contracts.ts    RPC and subscription contracts
client/web.ts          only DOM module: listener, contexts, commands, key recorder, editor helpers
client/shortcuts-screen.tsx, binding-dialog.tsx   Keyboard Shortcuts table
client/json-screen.tsx, code-editor.tsx           JSON editor
client/jsonc.ts        JSONC tokenizer, parser with ranges, formatter
client/user-bindings.ts  validation and comment-preserving edits of the user file
client/table-model.ts  table rows and row actions
client/completions.ts, editor-ops.ts, catalog.ts
client/keys.ts         key string parsing, event normalization
client/when.ts         when-clause compiler
client/keybindings.ts  binding compilation and resolution
client/text-motion.ts  word/line boundaries for inputs
client/defaults.ts     default bindings
client/native-shortcuts.ts  Paseo's built-in shortcuts, generated by `npm run native:extract`
client/paseo-actions.ts     Paseo's key syntax, current keys (with rebinds), synthetic key events
scripts/               native shortcut extraction from an installed Paseo app
test/                  vitest unit tests (pure modules and the file store)
```

When bumping `requirements.paseo`, run `npm run native:extract` (optionally `-- /path/to/Paseo.app`)
and review the diff: new Paseo actions become commands with no code change. `test/catalog.test.ts`
fails if one of the plugin's commands now shares an id or label with a Paseo action. The runtime
handles that (Paseo's implementation first), but check that the plugin's fallback still makes sense.
