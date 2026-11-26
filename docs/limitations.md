# Limitations

- Desktop and web only. On iOS/Android the plugin is a no-op, though you can still edit the file.
- Single-stroke keys only (no `ctrl+k ctrl+c` chords).
- Paseo's desktop menu takes some keys before the page sees them, so bindings on them never run:
  Cmd/Ctrl+= and Cmd/Ctrl+- (zoom), Cmd/Ctrl+0 (actual size), and on macOS Cmd+H, Cmd+Alt+H, Cmd+Q,
  Cmd+M, and Ctrl+Cmd+F. Its other macOS keys (Cmd+Shift+N, Cmd+R, Cmd+Shift+R, Cmd+Alt+I) reach
  the page first, so a binding on them replaces the menu item. The plugin cannot run menu items or
  change their keys; the table lists them read-only. On Linux and Windows only the zoom keys are
  listed: the others are untested. The key recorder turns the zoom keys off while it records, but
  cannot record the other blocked keys (pressing them hides, minimizes, or quits the app).
- The file lives on the daemon host, so each host has its own bindings.
- No `composerFocus` context: the composer has no stable DOM marker to target. Paseo's composer
  actions still apply Paseo's own focus rules.
- `terminalTextSelected` and `terminal.copySelection` read the selection through xterm's copy
  handler, and `terminal.paste` goes through its paste handler. There is no `terminal.selectAll`:
  xterm offers no DOM hook for it.
- `terminal.sendSequence` dispatches an `input` event to xterm's textarea; it relies on xterm internals.
- The JSON editor is a plugin screen, not Paseo's file tab, which only opens workspace files. On
  iOS/Android it is a plain text field (no highlighting, completion, or key recording).

## How the Paseo integration works

Paseo has no plugin API for keybindings or its actions, so the integration relies on its internals.
If a Paseo update changes them, the plugin degrades rather than breaking keys:

- Running before Paseo: Paseo's keydown listener starts with a `document.visibilityState` check.
  The plugin shadows that getter on `document`, and during a keydown (`window.event`) runs its
  bindings there, answering `"hidden"` when one took the key. If Paseo stops reading it, Paseo's
  keys win again.
- Running Paseo's actions: synthetic key events, which Paseo's handler accepts, built from the
  action list in `client/native-shortcuts.ts` (extracted from the app, see
  [Development](development.md)).
- Your Paseo rebinds: read from Paseo's storage (`@paseo:keyboard-shortcut-overrides`) at each
  keypress, so changes in Paseo's settings apply at once. The table reads them when it opens.
