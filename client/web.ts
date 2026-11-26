// The only module that touches browser APIs. Every export is gated on Platform.OS === "web"
// and is a no-op on native platforms.
import { copyText } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import { copyLines, deleteLines, type EditResult, moveLines } from "./editor-ops";
import { type Chord, chordFromEvent, type KeyEventLike } from "./keys";
import { type CommandHandler, compileKeybindings, dispatchKeybinding, type Keybinding } from "./keybindings";
import {
  type AppPlatform,
  isPaseoKeyFor,
  PASEO_COMMAND_IDS,
  PASEO_OVERRIDES_STORAGE_KEY,
  type PaseoOverrides,
  paseoTrigger,
  parseOverrides,
  strokeEventInit,
} from "./paseo-actions";
import { lineEnd, lineStart, wordEndAfter, wordStartBefore } from "./text-motion";
import type { WhenContext } from "./when";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomElement {
  tagName: string;
  isContentEditable?: boolean;
  closest(selector: string): DomElement | null;
  querySelector(selector: string): DomElement | null;
  dispatchEvent(event: unknown): boolean;
}
interface DomTextControl extends DomElement {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  selectionDirection: "forward" | "backward" | "none" | null;
  setSelectionRange(start: number, end: number, direction?: "forward" | "backward" | "none"): void;
  select(): void;
}
interface DomSelection {
  isCollapsed: boolean;
  toString(): string;
  modify?(alter: "move" | "extend", direction: "backward" | "forward", granularity: string): void;
}
interface DomKeyboardEvent extends KeyEventLike {
  type: string;
  target: unknown;
  isComposing: boolean;
  defaultPrevented: boolean;
  repeat: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
type KeydownListener = (event: DomKeyboardEvent) => void;
interface DomEditorNode extends DomTextControl {
  focus(): void;
  setAttribute(name: string, value: string): void;
  style: Record<string, string>;
  addEventListener(type: "keydown", listener: KeydownListener): void;
  removeEventListener(type: "keydown", listener: KeydownListener): void;
}
declare const window: {
  /** The event being dispatched (legacy, supported by Chromium/Electron). */
  event?: unknown;
  addEventListener(type: "keydown", listener: KeydownListener, capture: boolean): void;
  removeEventListener(type: "keydown", listener: KeydownListener, capture: boolean): void;
};
declare const document: {
  activeElement: DomElement | null;
  body: DomElement;
  head: { appendChild(node: unknown): void };
  getElementById(id: string): { textContent: string | null } | null;
  createElement(tag: "style"): { id: string; textContent: string | null };
  getSelection(): DomSelection | null;
  execCommand(command: string, showUi?: boolean, value?: string): boolean;
};
declare const localStorage: { getItem(key: string): string | null };
declare const navigator: {
  userAgent: string;
  clipboard?: { readText(): Promise<string> };
};
declare const KeyboardEvent: new (
  type: string,
  init: Record<string, unknown>,
) => { defaultPrevented: boolean };
declare const InputEvent: new (
  type: string,
  init: { data: string; inputType: string; bubbles?: boolean },
) => unknown;
interface DomDataTransfer {
  getData(format: string): string;
  setData(format: string, data: string): void;
}
declare const DataTransfer: new () => DomDataTransfer;
declare const ClipboardEvent: new (
  type: "copy" | "paste",
  init: { clipboardData: DomDataTransfer; bubbles?: boolean; cancelable?: boolean },
) => { defaultPrevented: boolean };

const TERMINAL_SELECTOR = ".xterm";

// ---------------------------------------------------------------------------
// Focus and selection

function focusedElement(event?: DomKeyboardEvent): DomElement | null {
  const target = event?.target as DomElement | null | undefined;
  if (target && typeof target.closest === "function") return target;
  return document.activeElement;
}

function isTerminal(el: DomElement | null): boolean {
  return !!el?.closest(TERMINAL_SELECTOR);
}

/** An <input>/<textarea> whose selection API is usable (e.g. not type=number/email). */
function asTextControl(el: DomElement | null): DomTextControl | null {
  if (!el) return null;
  const tag = el.tagName;
  if (tag !== "TEXTAREA" && tag !== "INPUT") return null;
  const control = el as DomTextControl;
  try {
    return typeof control.selectionStart === "number" ? control : null;
  } catch {
    return null;
  }
}

function isEditable(el: DomElement | null): boolean {
  if (!el || isTerminal(el)) return false;
  return asTextControl(el) !== null || el.isContentEditable === true;
}

function selectedText(el: DomElement | null): string {
  const control = isTerminal(el) ? null : asTextControl(el);
  if (control && control.selectionStart !== null && control.selectionEnd !== null) {
    const text = control.value.slice(control.selectionStart, control.selectionEnd);
    if (text) return text;
  }
  const selection = document.getSelection();
  return selection && !selection.isCollapsed ? selection.toString() : "";
}

/**
 * Text selected in the terminal around `el`, read without touching the clipboard: xterm answers a
 * copy event on its root element by writing its selection into the event's clipboardData (and
 * calling preventDefault) only when something is selected. "" when nothing is selected.
 */
function terminalSelection(el: DomElement | null): string {
  const root = el?.closest(TERMINAL_SELECTOR);
  if (!root) return "";
  try {
    const data = new DataTransfer();
    const event = new ClipboardEvent("copy", { clipboardData: data, bubbles: false, cancelable: true });
    root.dispatchEvent(event);
    return event.defaultPrevented ? data.getData("text/plain") : "";
  } catch {
    return "";
  }
}

function platformFlags(): WhenContext {
  const ua = navigator.userAgent;
  return {
    isMac: /Mac/.test(ua),
    isWindows: /Windows/.test(ua),
    isLinux: /Linux/.test(ua) && !/Android/.test(ua),
    isWeb: !/Electron/.test(ua),
  };
}

/** Platform for the Keyboard Shortcuts table's Paseo rows; undefined on iOS/Android (no listener there). */
export function appPlatform(): AppPlatform | undefined {
  if (Platform.OS !== "web") return undefined;
  const flags = platformFlags();
  return { mac: flags.isMac === true, desktop: flags.isWeb !== true };
}

function readContext(el: DomElement | null, platform: WhenContext): WhenContext {
  const terminalFocus = isTerminal(el);
  const control = terminalFocus ? null : asTextControl(el);
  const hasSelection = selectedText(el).length > 0;
  const context: Record<string, boolean | undefined> = {
    ...platform,
    terminalFocus,
    inputFocus: isEditable(el),
    textInputFocus: control !== null,
    hasSelection,
    editorHasSelection: hasSelection,
  };
  // Lazy: only computed when a matching binding's when clause asks for it.
  let terminalTextSelected: boolean | undefined;
  Object.defineProperty(context, "terminalTextSelected", {
    enumerable: true,
    get: () => (terminalTextSelected ??= terminalFocus && terminalSelection(el).length > 0),
  });
  return context;
}

// ---------------------------------------------------------------------------
// Commands. Each returns true when it handled the key; false lets the key through.

type Motion = (value: string, pos: number) => number;

function moveInControl(control: DomTextControl, motion: Motion, extend: boolean): void {
  const start = control.selectionStart ?? 0;
  const end = control.selectionEnd ?? start;
  const backward = control.selectionDirection === "backward";
  const anchor = backward ? end : start;
  const focus = backward ? start : end;
  const next = motion(control.value, focus);
  if (!extend) {
    control.setSelectionRange(next, next);
  } else if (next < anchor) {
    control.setSelectionRange(next, anchor, "backward");
  } else {
    control.setSelectionRange(anchor, next, "forward");
  }
}

function cursorCommand(
  motion: Motion,
  direction: "backward" | "forward",
  granularity: "word" | "lineboundary" | "documentboundary",
  mode: "move" | "select" | "delete",
) {
  return (): boolean => {
    const el = focusedElement();
    if (!isEditable(el)) return false;
    const control = asTextControl(el);
    if (control) {
      const collapsed = control.selectionStart === control.selectionEnd;
      if (mode === "delete" && !collapsed) return document.execCommand("delete");
      moveInControl(control, motion, mode !== "move");
      // execCommand keeps the edit on the undo stack and fires the input events React listens to.
      if (mode === "delete") document.execCommand("delete");
      return true;
    }
    const selection = document.getSelection();
    if (!selection?.modify) return false;
    if (mode === "delete" && !selection.isCollapsed) return document.execCommand("delete");
    selection.modify(mode === "move" ? "move" : "extend", direction, granularity);
    if (mode === "delete") document.execCommand("delete");
    return true;
  };
}

function editableExec(command: string) {
  return (): boolean => isEditable(focusedElement()) && document.execCommand(command);
}

function copy(): boolean {
  const text = selectedText(focusedElement());
  if (!text) return false;
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  if (!copied) {
    copyText(text).catch((error: unknown) => console.warn("[keybindings] copy failed", error));
  }
  return true;
}

function cut(): boolean {
  const el = focusedElement();
  if (!isEditable(el)) return false;
  const text = selectedText(el);
  if (!text) return false;
  if (document.execCommand("cut")) return true;
  copyText(text)
    .then(() => document.execCommand("delete"))
    .catch((error: unknown) => console.warn("[keybindings] cut failed", error));
  return true;
}

function paste(): boolean {
  if (!isEditable(focusedElement())) return false;
  if (document.execCommand("paste")) return true;
  const clipboard = navigator.clipboard;
  if (!clipboard) return false;
  clipboard
    .readText()
    .then((text) => document.execCommand("insertText", false, text))
    .catch((error: unknown) => console.warn("[keybindings] paste failed", error));
  return true;
}

function selectAll(): boolean {
  const el = focusedElement();
  if (!isEditable(el)) return false;
  const control = asTextControl(el);
  if (control) control.select();
  else document.execCommand("selectAll");
  return true;
}

function typeText(args: unknown): boolean {
  const text = (args as { text?: unknown } | undefined)?.text;
  if (typeof text !== "string" || !isEditable(focusedElement())) return false;
  return document.execCommand("insertText", false, text);
}

/** Line commands act on a focused <textarea> only: in a single-line input they make no sense. */
function lineCommand(op: (value: string, start: number, end: number) => EditResult | null) {
  return (): boolean => {
    const el = focusedElement();
    const control = isTerminal(el) ? null : asTextControl(el);
    if (!control || control.tagName !== "TEXTAREA") return false;
    const edit = op(control.value, control.selectionStart ?? 0, control.selectionEnd ?? 0);
    // At the first/last line a move does nothing, but the key is still consumed, as in VS Code.
    if (edit) applyEditorEdit(control, edit);
    return true;
  };
}

function terminalCopySelection(): boolean {
  const text = terminalSelection(focusedElement());
  if (!text) return false;
  copyText(text).catch((error: unknown) => console.warn("[keybindings] terminal copy failed", error));
  return true;
}

/** Pastes through xterm's own paste handler, so bracketed paste mode is honored. */
function terminalPaste(): boolean {
  const el = focusedElement();
  if (!el || !isTerminal(el)) return false;
  // Electron allows execCommand("paste"), which fires a trusted paste event at xterm's textarea.
  if (document.execCommand("paste")) return true;
  const clipboard = navigator.clipboard;
  if (!clipboard) return false;
  const target = el.closest(TERMINAL_SELECTOR)?.querySelector("textarea") ?? el;
  clipboard
    .readText()
    .then((text) => {
      if (!text) return;
      const data = new DataTransfer();
      data.setData("text/plain", text);
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    })
    .catch((error: unknown) => console.warn("[keybindings] terminal paste failed", error));
  return true;
}

/** Sends literal text to the focused terminal through xterm's input handler. */
function terminalSendSequence(args: unknown): boolean {
  const el = focusedElement();
  const text = (args as { text?: unknown } | undefined)?.text;
  if (!isTerminal(el) || typeof text !== "string" || !el) return false;
  el.dispatchEvent(new InputEvent("input", { data: text, inputType: "insertText", bubbles: true }));
  return true;
}

const toStart: Motion = (value, pos) => lineStart(value, pos);
const toEnd: Motion = (value, pos) => lineEnd(value, pos);
const toTop: Motion = () => 0;
const toBottom: Motion = (value) => value.length;

/** Command implementations by catalog id (aliases are resolved before lookup). */
// ---------------------------------------------------------------------------
// Paseo's actions. Paseo has no API to run them, so a Paseo command presses the action's current
// key (defaults plus the user's rebinds from Paseo's settings) on the focused element, and Paseo's
// own handler runs it. Our listener lets these synthetic keys through untouched.

/** The user's rebinds from Paseo's Settings → Shortcuts, read fresh so mid-session changes apply. */
export function readPaseoOverrides(): PaseoOverrides {
  try {
    return parseOverrides(localStorage.getItem(PASEO_OVERRIDES_STORAGE_KEY));
  } catch {
    return {};
  }
}

/** Presses the action's current key. Returns null when Paseo has no key for it, else whether Paseo ran it. */
function runPaseoAction(command: string, args: unknown): boolean | null {
  const platform = appPlatform();
  if (!platform) return null;
  const trigger = paseoTrigger(command, args, platform, readPaseoOverrides());
  if (!trigger) return null;
  const target = document.activeElement ?? document.body;
  let handled = false;
  shared.__paseoKeybindingsDispatching = true;
  try {
    for (const stroke of trigger.strokes) {
      const init = { ...strokeEventInit(stroke, trigger.digit), bubbles: true, cancelable: true, composed: true };
      const down = new KeyboardEvent("keydown", init);
      target.dispatchEvent(down);
      target.dispatchEvent(new KeyboardEvent("keyup", init));
      handled = down.defaultPrevented;
    }
  } finally {
    shared.__paseoKeybindingsDispatching = false;
  }
  return handled;
}

/**
 * A Paseo command. Paseo's implementation runs when it has a key; the plugin's (if any) when Paseo has
 * none, or ignored the key (its own focus conditions). Paseo-only commands consume the key either way.
 */
function paseoCommand(command: string, own: CommandHandler | undefined): CommandHandler {
  return (args, chord) => {
    const ran = runPaseoAction(command, args);
    if (ran === true) return true;
    if (own) return own(args, chord);
    return ran === false;
  };
}

/** "-<command>" for a Paseo command: keeps the key from Paseo when it is currently that action's key. */
function paseoRemoval(command: string): CommandHandler {
  return (_args, chord) => {
    const platform = appPlatform();
    return platform && isPaseoKeyFor(command, chord, platform, readPaseoOverrides()) ? "release" : false;
  };
}

/** Plugin command implementations by catalog id (aliases are resolved before lookup). */
const OWN_COMMANDS: Readonly<Record<string, CommandHandler>> = {
  "editor.copy": copy,
  "editor.cut": cut,
  "editor.paste": paste,
  "editor.selectAll": selectAll,
  "editor.undo": editableExec("undo"),
  "editor.redo": editableExec("redo"),
  "editor.type": typeText,
  "editor.deleteLines": lineCommand(deleteLines),
  "editor.copyLinesUp": lineCommand((v, s, e) => copyLines(v, s, e, "up")),
  "editor.copyLinesDown": lineCommand((v, s, e) => copyLines(v, s, e, "down")),
  "editor.moveLinesUp": lineCommand((v, s, e) => moveLines(v, s, e, "up")),
  "editor.moveLinesDown": lineCommand((v, s, e) => moveLines(v, s, e, "down")),
  "cursor.wordLeft": cursorCommand(wordStartBefore, "backward", "word", "move"),
  "cursor.wordRight": cursorCommand(wordEndAfter, "forward", "word", "move"),
  "cursor.wordLeftSelect": cursorCommand(wordStartBefore, "backward", "word", "select"),
  "cursor.wordRightSelect": cursorCommand(wordEndAfter, "forward", "word", "select"),
  "cursor.lineStart": cursorCommand(toStart, "backward", "lineboundary", "move"),
  "cursor.lineEnd": cursorCommand(toEnd, "forward", "lineboundary", "move"),
  "cursor.lineStartSelect": cursorCommand(toStart, "backward", "lineboundary", "select"),
  "cursor.lineEndSelect": cursorCommand(toEnd, "forward", "lineboundary", "select"),
  "cursor.top": cursorCommand(toTop, "backward", "documentboundary", "move"),
  "cursor.bottom": cursorCommand(toBottom, "forward", "documentboundary", "move"),
  "cursor.topSelect": cursorCommand(toTop, "backward", "documentboundary", "select"),
  "cursor.bottomSelect": cursorCommand(toBottom, "forward", "documentboundary", "select"),
  "editor.deleteWordLeft": cursorCommand(wordStartBefore, "backward", "word", "delete"),
  "editor.deleteWordRight": cursorCommand(wordEndAfter, "forward", "word", "delete"),
  "editor.deleteToLineStart": cursorCommand(toStart, "backward", "lineboundary", "delete"),
  "editor.deleteToLineEnd": cursorCommand(toEnd, "forward", "lineboundary", "delete"),
  "terminal.copySelection": terminalCopySelection,
  "terminal.paste": terminalPaste,
  "terminal.sendSequence": terminalSendSequence,
  noop: () => true,
};

/** Every command: the plugin's, Paseo's (with the plugin's as fallback), and Paseo removals. */
export const COMMANDS: Readonly<Record<string, CommandHandler>> = (() => {
  const commands: Record<string, CommandHandler> = { ...OWN_COMMANDS };
  for (const id of PASEO_COMMAND_IDS) {
    commands[id] = paseoCommand(id, OWN_COMMANDS[id]);
    commands[`-${id}`] = paseoRemoval(id);
  }
  return commands;
})();
const isPaseoCommand = (command: string) => PASEO_COMMAND_IDS.includes(command);

// ---------------------------------------------------------------------------
// Listener

/** Shared across installations (one per connected host) so the recorder pauses all of them. */
const shared = globalThis as { __paseoKeybindingsRecording?: number; __paseoKeybindingsDispatching?: boolean };
const isRecording = () => (shared.__paseoKeybindingsRecording ?? 0) > 0;

// ---------------------------------------------------------------------------
// Running before Paseo's own shortcut handler.
//
// Paseo's window keydown listener is registered before any plugin, and calls
// stopImmediatePropagation on a match, so a plain listener never sees Paseo's keys. Its first step is
// `if (document.visibilityState !== "visible") return`. We shadow that getter on the document: while
// a keydown is dispatching (window.event), it runs our bindings, and answers "hidden" when one took
// the key, so Paseo skips it. Any other read gets the real value. If Paseo stops reading it, we fall
// back to running after Paseo (its keys win), never to broken keys.

type PreResolve = (event: DomKeyboardEvent) => boolean;
const preResolveState = globalThis as {
  __paseoKeybindingsPreResolve?: { handlers: Set<PreResolve>; restore(): void };
};

function findGetter(target: object, name: string): (() => unknown) | undefined {
  for (let proto: object | null = target; proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (descriptor) return descriptor.get;
  }
  return undefined;
}

function addPreResolveHook(handler: PreResolve): () => void {
  let state = preResolveState.__paseoKeybindingsPreResolve;
  if (!state) {
    const realGetter = findGetter(document, "visibilityState");
    if (!realGetter) return () => {};
    const previous = Object.getOwnPropertyDescriptor(document, "visibilityState");
    const handlers = new Set<PreResolve>();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      enumerable: true,
      get() {
        const real = realGetter.call(document);
        const event = window.event as DomKeyboardEvent | undefined;
        if (real !== "visible" || !event || event.type !== "keydown") return real;
        // The key recorder owns every key while active, Paseo's included (otherwise recording Cmd+B
        // would toggle the sidebar instead).
        if (isRecording()) return "hidden";
        for (const run of handlers) if (run(event)) return "hidden";
        return real;
      },
    });
    state = {
      handlers,
      restore() {
        if (previous) Object.defineProperty(document, "visibilityState", previous);
        else delete (document as { visibilityState?: unknown }).visibilityState;
      },
    };
    preResolveState.__paseoKeybindingsPreResolve = state;
  }
  const current = state;
  current.handlers.add(handler);
  return () => {
    current.handlers.delete(handler);
    if (current.handlers.size === 0 && preResolveState.__paseoKeybindingsPreResolve === current) {
      current.restore();
      delete preResolveState.__paseoKeybindingsPreResolve;
    }
  };
}

export interface KeybindingsController {
  /** Replaces the user's bindings (layered after the defaults given at install). */
  setBindings(user: readonly Keybinding[]): void;
  dispose(): void;
}

/**
 * Registers one capture-phase keydown listener on window. No-op on native platforms.
 */
export function installKeybindings(defaults: readonly Keybinding[]): KeybindingsController {
  if (Platform.OS !== "web") return { setBindings() {}, dispose() {} };

  const compile = (user: readonly Keybinding[]) =>
    compileKeybindings(
      [...defaults, ...user],
      (binding, error) => console.warn(`[keybindings] skipping ${JSON.stringify(binding)}: ${error.message}`),
      { defaultCount: defaults.length, isExternal: isPaseoCommand },
    );
  let compiled = compile([]);
  const platform = platformFlags();

  // Each event is resolved once: in the pre-resolve hook when Paseo's listener asks, otherwise in our
  // own listener. Returns true when a binding took the key (Paseo must then skip it).
  const tried = new WeakSet<object>();
  const tryHandle = (event: DomKeyboardEvent): boolean => {
    if (tried.has(event)) return false;
    tried.add(event);
    // A second installation sees the event already handled; the recorder owns keys while active;
    // our own faked keys go straight to Paseo.
    if (event.defaultPrevented || event.isComposing || isRecording() || shared.__paseoKeybindingsDispatching) return false;
    const chord = chordFromEvent(event);
    if (!chord) return false;
    try {
      const result = dispatchKeybinding(compiled, chord, readContext(focusedElement(event), platform), COMMANDS);
      if (result === true) {
        event.preventDefault();
        event.stopPropagation();
      }
      // "release": kept from Paseo, but the focused element still gets the key.
      return result !== false;
    } catch (error) {
      console.warn("[keybindings] command failed", error);
    }
    return false;
  };
  const onKeyDown: KeydownListener = (event) => {
    tryHandle(event);
  };

  window.addEventListener("keydown", onKeyDown, true);
  const releaseHook = addPreResolveHook(tryHandle);
  return {
    setBindings(next) {
      compiled = compile(next);
    },
    dispose() {
      releaseHook();
      window.removeEventListener("keydown", onKeyDown, true);
    },
  };
}

// ---------------------------------------------------------------------------
// Key recorder

export const canRecordKeys = Platform.OS === "web";

/**
 * Captures key chords until stopped: every chord goes to `onChord`, bindings are paused, and
 * keys do not reach the app, Paseo's shortcuts included (the pre-resolve hook hides them from
 * Paseo while recording). Plain Enter calls `onEnter`, plain Escape calls `onEscape`.
 */
export function recordKeys(handlers: {
  onChord(chord: Chord): void;
  onEnter?(): void;
  onEscape?(): void;
}): () => void {
  if (!canRecordKeys) return () => {};
  shared.__paseoKeybindingsRecording = (shared.__paseoKeybindingsRecording ?? 0) + 1;
  if (shared.__paseoKeybindingsRecording === 1) setMenuCapturing(true);
  const onKeyDown: KeydownListener = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const chord = chordFromEvent(event);
    if (!chord || event.repeat) return;
    const plain = !chord.ctrl && !chord.alt && !chord.meta && !chord.shift;
    if (plain && chord.key === "enter" && handlers.onEnter) handlers.onEnter();
    else if (plain && chord.key === "escape" && handlers.onEscape) handlers.onEscape();
    else handlers.onChord(chord);
  };
  window.addEventListener("keydown", onKeyDown, true);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    window.removeEventListener("keydown", onKeyDown, true);
    shared.__paseoKeybindingsRecording = Math.max(0, (shared.__paseoKeybindingsRecording ?? 1) - 1);
    if (shared.__paseoKeybindingsRecording === 0) setMenuCapturing(false);
  };
}

/**
 * Turns off the desktop menu's zoom accelerators (Cmd/Ctrl+=, -, 0) while recording, as Paseo does
 * for its own shortcut recorder, so those keys can be recorded. The menu's other keys stay on; the
 * page gets some of them first (reload, new window), which the recorder then takes. No-op in a browser.
 */
function setMenuCapturing(capturing: boolean): void {
  const desktop = (globalThis as { paseoDesktop?: { menu?: { setCapturingShortcut?(capturing: boolean): Promise<unknown> } } })
    .paseoDesktop;
  desktop?.menu?.setCapturingShortcut?.(capturing)?.catch(() => {});
}

// ---------------------------------------------------------------------------
// JSON editor support (the editor's TextInput is a <textarea> on web)

const EDITOR_ATTRIBUTE = "data-paseo-keybindings-editor";
const EDITOR_STYLE_ID = "paseo-keybindings-editor-style";

export const editorOverlaySupported = Platform.OS === "web";

/** Makes the textarea a transparent, non-wrapping layer over the highlighted text. */
export function prepareEditorNode(node: unknown, colors: { caret: string; selection: string }): void {
  if (!editorOverlaySupported || !node) return;
  const el = node as DomEditorNode;
  el.setAttribute(EDITOR_ATTRIBUTE, "");
  el.setAttribute("wrap", "off");
  el.setAttribute("spellcheck", "false");
  el.style.whiteSpace = "pre";
  el.style.overflow = "hidden";
  el.style.resize = "none";
  el.style.caretColor = colors.caret;
  const css = `[${EDITOR_ATTRIBUTE}]::selection { background: ${colors.selection}; }`;
  const existing = document.getElementById(EDITOR_STYLE_ID);
  if (existing) {
    existing.textContent = css;
  } else {
    const style = document.createElement("style");
    style.id = EDITOR_STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
  }
}

export interface EditorKeyEvent {
  key: string;
  shift: boolean;
  alt: boolean;
  /** Ctrl or Cmd. */
  mod: boolean;
  value: string;
  selectionStart: number;
  selectionEnd: number;
}
export type EditorKeyResult = EditResult | "handled" | undefined;

/** Routes keydown on the editor to `onKey`; an edit result is applied with undo support. */
export function attachEditorKeys(node: unknown, onKey: (event: EditorKeyEvent) => EditorKeyResult): () => void {
  if (!editorOverlaySupported || !node) return () => {};
  const el = node as DomEditorNode;
  const listener: KeydownListener = (event) => {
    if (event.isComposing) return;
    const result = onKey({
      key: event.key,
      shift: event.shiftKey,
      alt: event.altKey,
      mod: event.ctrlKey || event.metaKey,
      value: el.value,
      selectionStart: el.selectionStart ?? 0,
      selectionEnd: el.selectionEnd ?? 0,
    });
    if (!result) return;
    event.preventDefault();
    event.stopPropagation();
    if (result !== "handled") applyEditorEdit(el, result);
  };
  el.addEventListener("keydown", listener);
  return () => el.removeEventListener("keydown", listener);
}

/**
 * Applies an edit through execCommand so it lands on the undo stack and fires the input event
 * React listens to. Returns false when the browser refused; the caller then sets the value.
 */
export function applyEditorEdit(node: unknown, edit: EditResult): boolean {
  if (!editorOverlaySupported || !node) return false;
  const el = node as DomEditorNode;
  el.focus();
  el.setSelectionRange(edit.start, edit.end);
  let ok = true;
  if (edit.insert) ok = document.execCommand("insertText", false, edit.insert);
  else if (edit.start < edit.end) ok = document.execCommand("delete");
  if (ok) el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  return ok;
}

export function focusEditorAt(node: unknown, start: number, end = start): void {
  if (!node) return;
  const el = node as DomEditorNode;
  el.focus();
  if (typeof el.setSelectionRange === "function") el.setSelectionRange(start, end);
}
