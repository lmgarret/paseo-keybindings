import type { Keybinding } from "./keybindings";

/**
 * Bindings shipped in code, applied before the user's keybindings.json (later entries win).
 * Empty on purpose: without user bindings the plugin leaves every key alone.
 * See README for the recommended terminal-aware Ctrl+C copy binding.
 */
export const DEFAULT_KEYBINDINGS: readonly Keybinding[] = [];
