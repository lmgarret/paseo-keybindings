import type { Keybinding } from "./keybindings";

/**
 * Default bindings. Later entries win over earlier ones for the same key.
 *
 * Only Ctrl+C ships by default: on macOS with Karabiner-Elements leaving raw Ctrl+C to Paseo,
 * this copies selected text everywhere except the terminal, where Ctrl+C stays SIGINT.
 * Other commands are available for custom bindings (see README).
 */
export const DEFAULT_KEYBINDINGS: readonly Keybinding[] = [
  { key: "ctrl+c", command: "editor.copy", when: "!terminalFocus && hasSelection" },
];
