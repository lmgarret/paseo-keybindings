Remaps keyboard shortcuts in the Paseo desktop and web app using VS Code style bindings: a key, a command, and an optional `when` clause such as `!terminalFocus && hasSelection`.

The default binding makes Ctrl+C copy selected text in chat, the composer, and agent output, while Ctrl+C in a focused terminal still interrupts the running process. This is meant for macOS setups that emulate Windows or Linux shortcuts with a tool like Karabiner-Elements, which cannot tell which pane has focus.

Keys without a matching binding behave exactly as before. Other commands cover cut, paste, select all, undo, redo, word and line movement and deletion in text inputs, and sending text to the focused terminal. Your bindings live in keybindings.json in the Paseo home folder on the daemon host and apply as soon as they change. Edit them from the Command Center: Preferences: Open Keyboard Shortcuts opens a searchable table with a key recorder, and Preferences: Open Keyboard Shortcuts (JSON) opens a JSON editor with highlighting, validation, and completion.

The plugin only listens to keyboard events inside the app. Its daemon side only reads, writes, and watches keybindings.json. It sends nothing anywhere else. It does nothing on iOS and Android, cannot trigger Paseo's built-in shortcuts, and keys taken by the desktop app menu never reach it.
