Remaps keyboard shortcuts in the Paseo desktop and web app using VS Code style bindings: a key, a command, and an optional `when` clause such as `!terminalFocus && hasSelection`.

The default binding makes Ctrl+C copy selected text in chat, the composer, and agent output, while Ctrl+C in a focused terminal still interrupts the running process. This is meant for macOS setups that emulate Windows or Linux shortcuts with a tool like Karabiner-Elements, which cannot tell which pane has focus.

Keys without a matching binding behave exactly as before. Other commands cover cut, paste, select all, undo, redo, word and line movement and deletion in text inputs, and sending text to the focused terminal. Bindings are defined in the plugin source for now; there is no settings screen.

The plugin only listens to keyboard events inside the app. It sends nothing anywhere and has no daemon component. It does nothing on iOS and Android, cannot trigger Paseo's built-in shortcuts, and keys taken by the desktop app menu never reach it.
