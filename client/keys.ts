// Key chords: parse "ctrl+shift+c" strings and normalize keyboard events to the same shape.
// Pure module (no DOM), so it is unit-tested directly.

export interface Chord {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** Canonical, lowercase key name, e.g. "c", "1", "/", "left", "backspace". */
  key: string;
}

/** The subset of KeyboardEvent this module reads. */
export interface KeyEventLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

const MODIFIERS: Record<string, "ctrl" | "shift" | "alt" | "meta"> = {
  ctrl: "ctrl",
  control: "ctrl",
  shift: "shift",
  alt: "alt",
  option: "alt",
  opt: "alt",
  meta: "meta",
  cmd: "meta",
  command: "meta",
  win: "meta",
  super: "meta",
};

const KEY_ALIASES: Record<string, string> = {
  arrowleft: "left",
  arrowright: "right",
  arrowup: "up",
  arrowdown: "down",
  esc: "escape",
  return: "enter",
  del: "delete",
  " ": "space",
  spacebar: "space",
  plus: "+",
};

// Physical keys whose meaning should not depend on Shift/Alt or the layout (US positions, like VS Code).
const CODE_KEYS: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
};

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta", "os", "altgraph", "capslock", "fn"]);

export function normalizeKeyName(name: string): string {
  const lower = name.toLowerCase();
  return KEY_ALIASES[lower] ?? lower;
}

/** Parses "ctrl+shift+c". Throws on empty keys, unknown modifiers, or multi-stroke chords. */
export function parseChord(input: string): Chord {
  const text = input.trim();
  if (!text) throw new Error("Empty key");
  if (/\s/.test(text)) throw new Error(`Multi-stroke chords are not supported: "${input}"`);

  let parts = text.split("+");
  // "ctrl++" means Ctrl and the "+" key.
  if (text.endsWith("++")) parts = [...parts.slice(0, -2), "+"];

  const chord: Chord = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  const keyPart = parts.pop() ?? "";
  for (const part of parts) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (!modifier) throw new Error(`Unknown modifier "${part}" in "${input}"`);
    chord[modifier] = true;
  }
  if (!keyPart) throw new Error(`Missing key in "${input}"`);
  if (MODIFIERS[keyPart.toLowerCase()]) throw new Error(`Missing key after modifiers in "${input}"`);
  chord.key = normalizeKeyName(keyPart);
  return chord;
}

/** Returns the chord for a keydown event, or null for a lone modifier press. */
export function chordFromEvent(event: KeyEventLike): Chord | null {
  let key: string;
  const letter = /^Key([A-Z])$/.exec(event.code);
  const digit = /^Digit([0-9])$/.exec(event.code);
  if (letter) key = letter[1].toLowerCase();
  else if (digit) key = digit[1];
  else if (CODE_KEYS[event.code]) key = CODE_KEYS[event.code];
  else key = normalizeKeyName(event.key ?? "");

  if (!key || MODIFIER_KEYS.has(key)) return null;
  return {
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey,
    key,
  };
}

export function chordsEqual(a: Chord, b: Chord): boolean {
  return (
    a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta
  );
}

export function formatChord(chord: Chord): string {
  const parts: string[] = [];
  if (chord.ctrl) parts.push("ctrl");
  if (chord.shift) parts.push("shift");
  if (chord.alt) parts.push("alt");
  if (chord.meta) parts.push("meta");
  parts.push(chord.key);
  return parts.join("+");
}
