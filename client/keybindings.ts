// Binding list compilation and resolution, keybindings.json style. Pure module (no DOM).
import { type Chord, chordsEqual, parseChord } from "./keys";
import { compileWhen, type WhenContext, type WhenPredicate } from "./when";

export interface Keybinding {
  /** e.g. "ctrl+c", "alt+shift+left". */
  key: string;
  /** Command id; prefix with "-" to remove an earlier binding of that command for this key. */
  command: string;
  /** Optional when clause, e.g. "!terminalFocus && hasSelection". */
  when?: string;
  /** Command arguments, e.g. { text: "\u0003" } for terminal.sendText. */
  args?: unknown;
}

export interface CompiledKeybinding {
  binding: Keybinding;
  chord: Chord;
  when: WhenPredicate;
}

/**
 * Compiles bindings in order. Invalid entries are reported through `onError` and skipped.
 * A "-command" entry removes earlier entries with the same key and command (and the same
 * `when`, when it is given).
 */
export function compileKeybindings(
  bindings: readonly Keybinding[],
  onError: (binding: Keybinding, error: Error) => void = () => {},
): CompiledKeybinding[] {
  let compiled: CompiledKeybinding[] = [];
  for (const binding of bindings) {
    try {
      const chord = parseChord(binding.key);
      if (binding.command.startsWith("-")) {
        const command = binding.command.slice(1);
        compiled = compiled.filter(
          (entry) =>
            !(
              entry.binding.command === command &&
              chordsEqual(entry.chord, chord) &&
              (binding.when === undefined || entry.binding.when === binding.when)
            ),
        );
        continue;
      }
      compiled.push({ binding, chord, when: compileWhen(binding.when) });
    } catch (error) {
      onError(binding, error instanceof Error ? error : new Error(String(error)));
    }
  }
  return compiled;
}

/** Returns the matching bindings for a chord, last-defined first (later bindings win). */
export function matchKeybindings(
  compiled: readonly CompiledKeybinding[],
  chord: Chord,
  context: WhenContext,
): CompiledKeybinding[] {
  const matches: CompiledKeybinding[] = [];
  for (let i = compiled.length - 1; i >= 0; i--) {
    const entry = compiled[i];
    if (chordsEqual(entry.chord, chord) && entry.when(context)) matches.push(entry);
  }
  return matches;
}

/**
 * Runs the first matching binding whose command reports it handled the key.
 * Returns true when a command handled it; the caller then swallows the event.
 * Unknown commands and commands returning false fall through, so the key reaches the app.
 */
export function dispatchKeybinding(
  compiled: readonly CompiledKeybinding[],
  chord: Chord,
  context: WhenContext,
  commands: Readonly<Record<string, (args: unknown) => boolean>>,
): boolean {
  for (const entry of matchKeybindings(compiled, chord, context)) {
    const run = commands[entry.binding.command];
    if (run && run(entry.binding.args)) return true;
  }
  return false;
}
