// Paseo's built-in actions as commands: their current keys (defaults plus the rebinds the user saved
// in Paseo's Settings → Shortcuts) and the key events that trigger them. Pure module (no DOM).
//
// Paseo has no plugin API to run its actions, so a Paseo command presses the action's current key:
// web.ts dispatches the events built here and Paseo's own handler runs the action.
import { type Chord, chordsEqual } from "./keys";
import { NATIVE_SHORTCUTS, type NativeShortcut } from "./native-shortcuts";

export interface AppPlatform {
  mac: boolean;
  /** The Electron desktop app (Paseo uses different keys in a browser). */
  desktop: boolean;
}

/** Where Paseo keeps the user's rebinds (AsyncStorage, which is localStorage on web). */
export const PASEO_OVERRIDES_STORAGE_KEY = "@paseo:keyboard-shortcut-overrides";

/** Binding id → combo in Paseo's syntax, or null when the user unassigned it. */
export type PaseoOverrides = Readonly<Record<string, string | null>>;

export function parseOverrides(raw: string | null | undefined): PaseoOverrides {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Record<string, string | null> = {};
    for (const [id, combo] of Object.entries(value)) {
      if (typeof combo === "string" || combo === null) result[id] = combo;
    }
    return result;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Paseo's key syntax: "Cmd+Shift+\", "Mod+/", "Alt+Digit", "Shift+?"; strokes separated by spaces.

interface KeySpec {
  code: string;
  /** US-layout key value; omitted for named keys, whose key equals the code. */
  key?: string;
  shiftedKey?: string;
}

const PUNCTUATION: Record<string, KeySpec> = {
  "-": { code: "Minus", key: "-", shiftedKey: "_" },
  "=": { code: "Equal", key: "=", shiftedKey: "+" },
  "\\": { code: "Backslash", key: "\\", shiftedKey: "|" },
  "[": { code: "BracketLeft", key: "[", shiftedKey: "{" },
  "]": { code: "BracketRight", key: "]", shiftedKey: "}" },
  ";": { code: "Semicolon", key: ";", shiftedKey: ":" },
  "'": { code: "Quote", key: "'", shiftedKey: '"' },
  ",": { code: "Comma", key: ",", shiftedKey: "<" },
  ".": { code: "Period", key: ".", shiftedKey: ">" },
  "`": { code: "Backquote", key: "`", shiftedKey: "~" },
  "/": { code: "Slash", key: "/", shiftedKey: "?" },
  "?": { code: "Slash", key: "?" },
};
const SHIFTED_DIGITS = ")!@#$%^&*(";
const NAMED: Record<string, string> = {
  Space: "space",
  Enter: "enter",
  Backspace: "backspace",
  Escape: "escape",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Tab: "tab",
  Delete: "delete",
  Home: "home",
  End: "end",
  PageUp: "pageup",
  PageDown: "pagedown",
  Insert: "insert",
};
// Our key names for the physical keys above (keys.ts matches punctuation by code, US positions).
const CODE_TO_OUR_KEY: Record<string, string> = {
  Minus: "-",
  Equal: "=",
  Backslash: "\\",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Backquote: "`",
  Slash: "/",
};

export interface PaseoStroke {
  /** The stroke in our terms; for a digit placeholder, the "1" variant. */
  chord: Chord;
  code: string;
  /** Paseo's "Digit" placeholder: the stroke covers 1 through 9. */
  digits: boolean;
}

function parseStroke(text: string, mac: boolean): PaseoStroke | null {
  const parts = text.split("+");
  if (parts.some((p) => p === "")) return null;
  const chord: Chord = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
  let keyPart: string | undefined;
  for (const part of parts) {
    if (part === "Cmd") chord.meta = true;
    else if (part === "Ctrl") chord.ctrl = true;
    else if (part === "Alt") chord.alt = true;
    else if (part === "Shift") chord.shift = true;
    else if (part === "Mod") chord[mac ? "meta" : "ctrl"] = true;
    else if (keyPart === undefined) keyPart = part;
    else return null;
  }
  if (keyPart === undefined) return null;
  if (keyPart === "Digit") return { chord: { ...chord, key: "1" }, code: "Digit1", digits: true };
  if (/^[A-Z]$/.test(keyPart)) return { chord: { ...chord, key: keyPart.toLowerCase() }, code: `Key${keyPart}`, digits: false };
  if (/^[0-9]$/.test(keyPart)) return { chord: { ...chord, key: keyPart }, code: `Digit${keyPart}`, digits: false };
  if (/^F([1-9]|1[0-2])$/.test(keyPart)) return { chord: { ...chord, key: keyPart.toLowerCase() }, code: keyPart, digits: false };
  const punctuation = PUNCTUATION[keyPart];
  if (punctuation) return { chord: { ...chord, key: CODE_TO_OUR_KEY[punctuation.code] }, code: punctuation.code, digits: false };
  const named = NAMED[keyPart];
  if (named) return { chord: { ...chord, key: named }, code: keyPart, digits: false };
  return null;
}

/** Parses a Paseo combo into strokes. Null when it is empty or not understood. */
export function parsePaseoCombo(combo: string, mac: boolean): PaseoStroke[] | null {
  const text = combo.trim();
  if (!text) return null;
  const strokes: PaseoStroke[] = [];
  for (const part of text.split(" ")) {
    const stroke = parseStroke(part, mac);
    if (!stroke) return null;
    strokes.push(stroke);
  }
  return strokes;
}

/** Init for a synthetic KeyboardEvent that Paseo's matcher (key, then code) accepts as this stroke. */
export function strokeEventInit(stroke: PaseoStroke, digit?: number) {
  const { chord } = stroke;
  let code = stroke.code;
  let key: string;
  if (stroke.digits) {
    const d = String(digit ?? 1);
    code = `Digit${d}`;
    key = chord.shift ? SHIFTED_DIGITS[Number(d)] : d;
  } else if (/^Key[A-Z]$/.test(code)) {
    key = chord.shift ? code.slice(3) : code.slice(3).toLowerCase();
  } else if (/^Digit[0-9]$/.test(code)) {
    key = chord.shift ? SHIFTED_DIGITS[Number(code.slice(5))] : code.slice(5);
  } else if (code === "Space") {
    key = " ";
  } else {
    const spec = Object.values(PUNCTUATION).find((p) => p.code === code && p.key === CODE_TO_OUR_KEY[code]);
    key = spec ? (chord.shift && spec.shiftedKey ? spec.shiftedKey : spec.key!) : code;
  }
  return {
    key,
    code,
    ctrlKey: chord.ctrl,
    shiftKey: chord.shift,
    altKey: chord.alt,
    metaKey: chord.meta,
  };
}

/** A stroke in our key syntax ("meta+shift+\\"); digit strokes give the "1" variant. */
export function formatStroke(stroke: PaseoStroke): string {
  const { chord } = stroke;
  return [chord.ctrl && "ctrl", chord.shift && "shift", chord.alt && "alt", chord.meta && "meta", chord.key]
    .filter(Boolean)
    .join("+");
}

// ---------------------------------------------------------------------------
// Current bindings

export interface PaseoBinding {
  shortcut: NativeShortcut;
  /** Current key; null when unassigned (or rebound to something we cannot parse). */
  strokes: PaseoStroke[] | null;
  /** The user changed this binding in Paseo's settings. */
  rebound: boolean;
}

export function appliesTo(shortcut: NativeShortcut, platform: AppPlatform): boolean {
  return (
    (shortcut.mac === undefined || shortcut.mac === platform.mac) &&
    (shortcut.desktop === undefined || shortcut.desktop === platform.desktop)
  );
}

/** Paseo's bindings on this platform, with the user's rebinds applied. */
export function platformBindings(
  platform: AppPlatform,
  overrides: PaseoOverrides,
  shortcuts: readonly NativeShortcut[] = NATIVE_SHORTCUTS,
): PaseoBinding[] {
  return shortcuts
    .filter((shortcut) => appliesTo(shortcut, platform))
    .map((shortcut) => {
      const override = overrides[shortcut.id];
      const rebound = override !== undefined;
      const combo = override === undefined ? shortcut.combo : override;
      return { shortcut, strokes: combo === null ? null : parsePaseoCombo(combo, platform.mac), rebound };
    });
}

/** Commands Paseo implements, in table order. */
export const PASEO_COMMAND_IDS: readonly string[] = [...new Set(NATIVE_SHORTCUTS.map((s) => s.command))];

/** True when a binding's args select this shortcut (e.g. { delta: 1 } for "Next workspace"). */
function argsSelect(shortcut: NativeShortcut, args: unknown): boolean {
  if (!shortcut.args) return true;
  const given = (args ?? {}) as Record<string, unknown>;
  return Object.entries(shortcut.args).every(([key, value]) => given[key] === value);
}

export interface PaseoTrigger {
  strokes: PaseoStroke[];
  /** For digit bindings: the digit to press. */
  digit?: number;
}

/**
 * The keys that run `command` with `args` right now, or null when Paseo has no key for it on this
 * platform (never had one, or the user unassigned it).
 */
export function paseoTrigger(
  command: string,
  args: unknown,
  platform: AppPlatform,
  overrides: PaseoOverrides,
  shortcuts: readonly NativeShortcut[] = NATIVE_SHORTCUTS,
): PaseoTrigger | null {
  const index = (args as { index?: unknown } | undefined)?.index;
  for (const binding of platformBindings(platform, overrides, shortcuts)) {
    if (binding.shortcut.command !== command || !binding.strokes || !argsSelect(binding.shortcut, args)) continue;
    const last = binding.strokes[binding.strokes.length - 1];
    if (!last.digits) return { strokes: binding.strokes };
    if (typeof index === "number" && Number.isInteger(index) && index >= 1 && index <= 9) {
      return { strokes: binding.strokes, digit: index };
    }
  }
  return null;
}

/** True when `chord` alone currently runs `command` in Paseo (multi-stroke bindings never match). */
export function isPaseoKeyFor(
  command: string,
  chord: Chord,
  platform: AppPlatform,
  overrides: PaseoOverrides,
  shortcuts: readonly NativeShortcut[] = NATIVE_SHORTCUTS,
): boolean {
  return platformBindings(platform, overrides, shortcuts).some((binding) => {
    if (binding.shortcut.command !== command || binding.strokes?.length !== 1) return false;
    const stroke = binding.strokes[0];
    if (!stroke.digits) return chordsEqual(stroke.chord, chord);
    return /^[1-9]$/.test(chord.key) && chordsEqual({ ...stroke.chord, key: chord.key }, chord);
  });
}
