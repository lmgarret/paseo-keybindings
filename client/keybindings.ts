// Binding list compilation and resolution, keybindings.json style. Pure module (no DOM).
import { canonicalCommand } from "./catalog";
import { type Chord, chordsEqual, parseChord } from "./keys";
import { compileWhen, type WhenContext, type WhenPredicate } from "./when";

export interface Keybinding {
  /** e.g. "ctrl+c", "alt+shift+left". */
  key: string;
  /** Command id; prefix with "-" to remove an earlier binding of that command for this key. */
  command: string;
  /** Optional when clause, e.g. "!terminalFocus && hasSelection". */
  when?: string;
  /** Command arguments, e.g. { text: "\u0003" } for terminal.sendSequence. */
  args?: unknown;
}

export interface CompiledKeybinding {
  binding: Keybinding;
  /**
   * Catalog id of the command (aliases such as VS Code ids resolved). Kept removals of external
   * commands are "-<id>".
   */
  command: string;
  chord: Chord;
  when: WhenPredicate;
}

export interface CompileOptions {
  /**
   * The first `defaultCount` bindings are defaults; the rest are the user's. As in VS Code, a
   * "-command" entry removes defaults only, never the user's own bindings. Defaults to all.
   */
  defaultCount?: number;
  /**
   * Commands whose keys live outside this list (Paseo's actions). Their removals are kept as
   * "-<id>" entries, at the lowest priority, so a "-<id>" handler can act on that key when no other
   * binding takes it.
   */
  isExternal?(command: string): boolean;
}

/**
 * Compiles bindings in order. Invalid entries are reported through `onError` and skipped.
 * A "-command" entry removes earlier default entries with the same key and command (and the same
 * `when`, when it is given). Command aliases are resolved, so "-cursorWordLeft" removes a
 * "cursor.wordLeft" binding.
 */
export function compileKeybindings(
  bindings: readonly Keybinding[],
  onError: (binding: Keybinding, error: Error) => void = () => {},
  options: CompileOptions = {},
): CompiledKeybinding[] {
  const defaultCount = options.defaultCount ?? Infinity;
  let compiled: (CompiledKeybinding & { isDefault: boolean })[] = [];
  const kept: CompiledKeybinding[] = [];
  bindings.forEach((binding, index) => {
    try {
      const chord = parseChord(binding.key);
      if (binding.command.startsWith("-")) {
        const command = canonicalCommand(binding.command.slice(1));
        compiled = compiled.filter(
          (entry) =>
            !(
              entry.isDefault &&
              entry.command === command &&
              chordsEqual(entry.chord, chord) &&
              (binding.when === undefined || entry.binding.when === binding.when)
            ),
        );
        if (options.isExternal?.(command)) {
          kept.push({ binding, command: `-${command}`, chord, when: compileWhen(binding.when) });
        }
        return;
      }
      compiled.push({
        binding,
        command: canonicalCommand(binding.command),
        chord,
        when: compileWhen(binding.when),
        isDefault: index < defaultCount,
      });
    } catch (error) {
      onError(binding, error instanceof Error ? error : new Error(String(error)));
    }
  });
  // Later entries win, so kept removals go first: they apply only when no binding takes the key.
  return [...kept, ...compiled.map(({ isDefault: _, ...entry }) => entry)];
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
 * What a command did with a key: true handled it (the caller swallows the event), false declined
 * (the next matching binding runs), "release" stops resolution and lets the key reach the focused
 * element while keeping it from Paseo's own shortcuts.
 */
export type CommandResult = boolean | "release";
export type CommandHandler = (args: unknown, chord: Chord) => CommandResult;

/**
 * Runs the first matching binding whose command does not decline, and returns its result.
 * Unknown commands and commands returning false fall through; false means nothing took the key.
 */
export function dispatchKeybinding(
  compiled: readonly CompiledKeybinding[],
  chord: Chord,
  context: WhenContext,
  commands: Readonly<Record<string, CommandHandler>>,
): CommandResult {
  for (const entry of matchKeybindings(compiled, chord, context)) {
    const run = commands[entry.command];
    const result = run ? run(entry.binding.args, chord) : false;
    if (result !== false) return result;
  }
  return false;
}
