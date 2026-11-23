// The only module that touches browser APIs. Every export is gated on Platform.OS === "web"
// and is a no-op on native platforms.
import { copyText } from "@getpaseo/plugin/client/ui";
import { Platform } from "react-native";
import { chordFromEvent, type KeyEventLike } from "./keys";
import { compileKeybindings, dispatchKeybinding, type Keybinding } from "./keybindings";
import { lineEnd, lineStart, wordEndAfter, wordStartBefore } from "./text-motion";
import type { WhenContext } from "./when";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomElement {
  tagName: string;
  isContentEditable?: boolean;
  closest(selector: string): DomElement | null;
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
  target: unknown;
  isComposing: boolean;
  defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}
type KeydownListener = (event: DomKeyboardEvent) => void;
declare const window: {
  addEventListener(type: "keydown", listener: KeydownListener, capture: boolean): void;
  removeEventListener(type: "keydown", listener: KeydownListener, capture: boolean): void;
};
declare const document: {
  activeElement: DomElement | null;
  getSelection(): DomSelection | null;
  execCommand(command: string, showUi?: boolean, value?: string): boolean;
};
declare const navigator: {
  userAgent: string;
  clipboard?: { readText(): Promise<string> };
};
declare const InputEvent: new (
  type: string,
  init: { data: string; inputType: string; bubbles?: boolean },
) => unknown;

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

function platformFlags(): WhenContext {
  const ua = navigator.userAgent;
  return {
    isMac: /Mac/.test(ua),
    isWindows: /Windows/.test(ua),
    isLinux: /Linux/.test(ua) && !/Android/.test(ua),
  };
}

function readContext(el: DomElement | null, platform: WhenContext): WhenContext {
  const terminalFocus = isTerminal(el);
  const control = terminalFocus ? null : asTextControl(el);
  return {
    ...platform,
    terminalFocus,
    inputFocus: isEditable(el),
    textInputFocus: control !== null,
    hasSelection: selectedText(el).length > 0,
  };
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
  granularity: "word" | "lineboundary",
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

/** Sends literal text to the focused terminal through xterm's input handler. */
function terminalSendText(args: unknown): boolean {
  const el = focusedElement();
  const text = (args as { text?: unknown } | undefined)?.text;
  if (!isTerminal(el) || typeof text !== "string" || !el) return false;
  el.dispatchEvent(new InputEvent("input", { data: text, inputType: "insertText", bubbles: true }));
  return true;
}

const toStart: Motion = (value, pos) => lineStart(value, pos);
const toEnd: Motion = (value, pos) => lineEnd(value, pos);

export const COMMANDS: Readonly<Record<string, (args: unknown) => boolean>> = {
  "editor.copy": copy,
  "editor.cut": cut,
  "editor.paste": paste,
  "editor.selectAll": selectAll,
  "editor.undo": editableExec("undo"),
  "editor.redo": editableExec("redo"),
  "cursor.wordLeft": cursorCommand(wordStartBefore, "backward", "word", "move"),
  "cursor.wordRight": cursorCommand(wordEndAfter, "forward", "word", "move"),
  "cursor.wordLeftSelect": cursorCommand(wordStartBefore, "backward", "word", "select"),
  "cursor.wordRightSelect": cursorCommand(wordEndAfter, "forward", "word", "select"),
  "cursor.lineStart": cursorCommand(toStart, "backward", "lineboundary", "move"),
  "cursor.lineEnd": cursorCommand(toEnd, "forward", "lineboundary", "move"),
  "cursor.lineStartSelect": cursorCommand(toStart, "backward", "lineboundary", "select"),
  "cursor.lineEndSelect": cursorCommand(toEnd, "forward", "lineboundary", "select"),
  "editor.deleteWordLeft": cursorCommand(wordStartBefore, "backward", "word", "delete"),
  "editor.deleteWordRight": cursorCommand(wordEndAfter, "forward", "word", "delete"),
  "editor.deleteToLineStart": cursorCommand(toStart, "backward", "lineboundary", "delete"),
  "editor.deleteToLineEnd": cursorCommand(toEnd, "forward", "lineboundary", "delete"),
  "terminal.sendText": terminalSendText,
};

// ---------------------------------------------------------------------------
// Listener

/**
 * Registers one capture-phase keydown listener on window. Returns its remover.
 * No-op on native platforms.
 */
export function installKeybindings(bindings: readonly Keybinding[]): () => void {
  if (Platform.OS !== "web") return () => {};

  const compiled = compileKeybindings(bindings, (binding, error) =>
    console.warn(`[keybindings] skipping ${JSON.stringify(binding)}: ${error.message}`),
  );
  const platform = platformFlags();

  const onKeyDown: KeydownListener = (event) => {
    // A second installation (one per connected host) sees the event already handled.
    if (event.defaultPrevented || event.isComposing) return;
    const chord = chordFromEvent(event);
    if (!chord) return;
    const el = focusedElement(event);
    try {
      if (dispatchKeybinding(compiled, chord, readContext(el, platform), COMMANDS)) {
        event.preventDefault();
        event.stopPropagation();
      }
    } catch (error) {
      console.warn("[keybindings] command failed", error);
    }
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
