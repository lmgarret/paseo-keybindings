import type { PluginTheme } from "@getpaseo/plugin";
import { ScrollView } from "@getpaseo/plugin/client/ui";
import { forwardRef, type ReactNode, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import {
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  Pressable,
  type ScrollView as NativeScrollView,
  Text,
  TextInput,
  type TextInputSelectionChangeEventData,
  View,
} from "react-native";
import { type Completions, completionsAt } from "./completions";
import { type EditResult, indentSelection, newlineWithIndent, toggleLineComment } from "./editor-ops";
import { lineColumnAt, propertyKeyTokens, tokenize } from "./jsonc";
import { MONO, withAlpha } from "./ui-common";
import type { Diagnostic } from "./user-bindings";
import {
  applyEditorEdit,
  attachEditorKeys,
  type EditorKeyEvent,
  type EditorKeyResult,
  editorOverlaySupported,
  focusEditorAt,
  prepareEditorNode,
} from "./web";

const FONT_SIZE = 13;
const LINE_HEIGHT = 20;
const PAD = 10;
const GUTTER_PAD = 12;
const MAX_SUGGESTIONS = 8;

export interface CodeEditorHandle {
  /** Applies an edit with undo support (falls back to replacing the value). */
  apply(edit: EditResult): void;
  /** Focuses and selects a range, scrolling it into view. */
  reveal(start: number, end?: number): void;
  selection(): { start: number; end: number };
}

export interface CodeEditorProps {
  theme: PluginTheme;
  value: string;
  onChangeText(value: string): void;
  diagnostics: readonly Diagnostic[];
  onSave(): void;
  onFormat(): void;
}

function Highlighted({ theme, value, diagnostics }: { theme: PluginTheme; value: string; diagnostics: readonly Diagnostic[] }) {
  const c = theme.colors;
  return useMemo(() => {
    const tokens = tokenize(value);
    const keys = propertyKeyTokens(tokens);
    const children: ReactNode[] = [];
    tokens.forEach((token, i) => {
      if (token.kind === "whitespace") {
        children.push(token.text);
        return;
      }
      const color =
        token.kind === "string"
          ? keys.has(i)
            ? c.accent
            : c.statusSuccess
          : token.kind === "number" || token.kind === "keyword"
            ? c.statusWarning
            : token.kind === "lineComment" || token.kind === "blockComment"
              ? c.foregroundMuted
              : token.kind === "invalid"
                ? c.statusDanger
                : c.foreground;
      const problem = diagnostics.find((d) => d.start < token.end && d.end > token.start);
      children.push(
        <Text
          key={i}
          style={{
            color,
            fontStyle: token.kind.endsWith("Comment") ? "italic" : "normal",
            textDecorationLine: problem ? "underline" : "none",
            textDecorationStyle: "dotted",
            textDecorationColor: problem?.severity === "error" ? c.statusDanger : c.statusWarning,
          }}
        >
          {token.text}
        </Text>,
      );
    });
    // A final newline needs a character after it to occupy a line.
    if (value.endsWith("\n") || value === "") children.push(" ");
    return children;
  }, [value, diagnostics, c]);
}

export const CodeEditor = forwardRef<CodeEditorHandle, CodeEditorProps>(function CodeEditor(
  { theme, value, onChangeText, diagnostics, onSave, onFormat },
  ref,
) {
  const c = theme.colors;
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<NativeScrollView>(null);
  const [charWidth, setCharWidth] = useState(7.8);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const lines = useMemo(() => value.split("\n"), [value]);
  const longest = useMemo(() => lines.reduce((max, line) => Math.max(max, line.length), 0), [lines]);
  const gutterWidth = String(lines.length).length * charWidth + GUTTER_PAD * 2;
  const contentWidth = Math.max(viewport.width - gutterWidth, longest * charWidth + PAD * 2 + 40);
  const contentHeight = Math.max(viewport.height, (lines.length + 3) * LINE_HEIGHT + PAD * 2);
  const caret = lineColumnAt(value, selection.end);

  const lineSeverity = useMemo(() => {
    const map = new Map<number, Diagnostic["severity"]>();
    for (const d of diagnostics) {
      const line = lineColumnAt(value, d.start).line;
      if (map.get(line) !== "error") map.set(line, d.severity);
    }
    return map;
  }, [diagnostics, value]);

  const completions: Completions | null = useMemo(() => {
    if (!editorOverlaySupported || !suggestOpen || selection.start !== selection.end) return null;
    const result = completionsAt(value, selection.end);
    return result ? { ...result, items: result.items.slice(0, 50) } : null;
  }, [suggestOpen, selection, value]);
  const completionsRef = useRef(completions);
  completionsRef.current = completions;
  const suggestIndexRef = useRef(suggestIndex);
  suggestIndexRef.current = Math.min(suggestIndex, Math.max(0, (completions?.items.length ?? 1) - 1));

  const acceptEdit = (list: Completions, index: number): EditResult => {
    const item = list.items[index];
    const end = list.from + item.insert.length;
    return { start: list.from, end: list.to, insert: item.insert, selectionStart: end, selectionEnd: end };
  };

  const apply = (edit: EditResult) => {
    if (!applyEditorEdit(inputRef.current, edit)) {
      onChangeText(value.slice(0, edit.start) + edit.insert + value.slice(edit.end));
      setSelection({ start: edit.selectionStart, end: edit.selectionEnd });
    }
  };

  const reveal = (start: number, end = start) => {
    const { line } = lineColumnAt(value, start);
    scrollRef.current?.scrollTo({ y: Math.max(0, line * LINE_HEIGHT - viewport.height / 3), animated: false });
    focusEditorAt(inputRef.current, start, end);
    setSelection({ start, end });
  };

  useImperativeHandle(ref, () => ({ apply, reveal, selection: () => selectionRef.current }));

  // Keys are read through refs so the listener is attached once.
  const handlers = useRef({ onSave, onFormat });
  handlers.current = { onSave, onFormat };
  const onKey = (event: EditorKeyEvent): EditorKeyResult => {
    const list = completionsRef.current;
    if (list) {
      const count = Math.min(list.items.length, MAX_SUGGESTIONS);
      if (event.key === "ArrowDown") {
        setSuggestIndex((i) => (i + 1) % count);
        return "handled";
      }
      if (event.key === "ArrowUp") {
        setSuggestIndex((i) => (i - 1 + count) % count);
        return "handled";
      }
      if ((event.key === "Enter" || event.key === "Tab") && !event.mod && !event.shift) {
        setSuggestOpen(false);
        return acceptEdit(list, suggestIndexRef.current);
      }
      if (event.key === "Escape") {
        setSuggestOpen(false);
        return "handled";
      }
    }
    if (event.mod && event.key.toLowerCase() === "s") {
      handlers.current.onSave();
      return "handled";
    }
    if (event.shift && event.alt && (event.key.toLowerCase() === "f" || event.key === "Ï")) {
      handlers.current.onFormat();
      return "handled";
    }
    if (event.mod && event.key === " ") {
      setSuggestOpen(true);
      setSuggestIndex(0);
      return "handled";
    }
    if (event.mod && (event.key === "/" || event.key === ":")) {
      return toggleLineComment(event.value, event.selectionStart, event.selectionEnd);
    }
    if (event.key === "Tab" && !event.mod && !event.alt) {
      return indentSelection(event.value, event.selectionStart, event.selectionEnd, event.shift);
    }
    if (event.key === "Enter" && !event.mod && !event.alt && !event.shift) {
      return newlineWithIndent(event.value, event.selectionStart, event.selectionEnd);
    }
    return undefined;
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;

  useEffect(() => {
    const node = inputRef.current;
    prepareEditorNode(node, { caret: c.foreground, selection: withAlpha(c.accent, 0.3) });
    return attachEditorKeys(node, (event) => onKeyRef.current(event));
  }, [c.foreground, c.accent]);

  const onSelectionChange = (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    setSelection(event.nativeEvent.selection);
  };

  const text = { fontFamily: MONO, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT };

  if (!editorOverlaySupported) {
    // Native: a plain monospace input; highlighting needs the web overlay.
    return (
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        accessibilityLabel="keybindings.json"
        style={[text, { flex: 1, color: c.foreground, padding: PAD, textAlignVertical: "top", backgroundColor: c.surface0 }]}
      />
    );
  }

  const visibleItems = completions?.items.slice(0, MAX_SUGGESTIONS) ?? [];
  const anchor = completions ? lineColumnAt(value, completions.from) : null;

  return (
    <View
      style={{ flex: 1, backgroundColor: c.surface0 }}
      onLayout={(e: LayoutChangeEvent) => setViewport({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {/* Measures one monospace character. */}
      <Text
        style={[text, { position: "absolute", opacity: 0 }]}
        onLayout={(e: LayoutChangeEvent) => setCharWidth(e.nativeEvent.layout.width / 50)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {"0".repeat(50)}
      </Text>
      <ScrollView ref={scrollRef} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", minHeight: contentHeight }}>
          <View style={{ width: gutterWidth, paddingTop: PAD, borderRightWidth: 1, borderRightColor: c.border, backgroundColor: c.surface1 }}>
            {lines.map((_, i) => {
              const severity = lineSeverity.get(i);
              return (
                <Text
                  key={i}
                  style={[
                    text,
                    {
                      textAlign: "right",
                      paddingRight: GUTTER_PAD,
                      color:
                        severity === "error"
                          ? c.statusDanger
                          : severity === "warning"
                            ? c.statusWarning
                            : i === caret.line
                              ? c.foreground
                              : c.foregroundMuted,
                    },
                  ]}
                >
                  {i + 1}
                </Text>
              );
            })}
          </View>
          <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ minWidth: "100%" }}>
            <View style={{ width: contentWidth, height: contentHeight }}>
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: PAD + caret.line * LINE_HEIGHT,
                  height: LINE_HEIGHT,
                  backgroundColor: withAlpha(c.foreground, 0.05),
                }}
              />
              <Text style={[text, { position: "absolute", left: PAD, top: PAD, color: c.foreground }]} selectable={false}>
                <Highlighted theme={theme} value={value} diagnostics={diagnostics} />
              </Text>
              <TextInput
                ref={inputRef}
                value={value}
                onChangeText={(next) => {
                  onChangeText(next);
                  setSuggestOpen(true);
                  setSuggestIndex(0);
                }}
                onSelectionChange={onSelectionChange}
                multiline
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                scrollEnabled={false}
                accessibilityLabel="keybindings.json"
                style={[
                  text,
                  {
                    position: "absolute",
                    left: 0,
                    top: 0,
                    width: contentWidth,
                    height: contentHeight,
                    padding: PAD,
                    margin: 0,
                    borderWidth: 0,
                    color: "transparent",
                    backgroundColor: "transparent",
                    outlineStyle: "none",
                  } as object,
                ]}
              />
              {anchor && visibleItems.length > 0 ? (
                <View
                  style={{
                    position: "absolute",
                    left: PAD + anchor.column * charWidth,
                    top: PAD + (anchor.line + 1) * LINE_HEIGHT + 2,
                    minWidth: 260,
                    maxWidth: 460,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: c.border,
                    backgroundColor: c.surface1,
                    paddingVertical: 4,
                    shadowColor: "#000",
                    shadowOpacity: 0.25,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  {visibleItems.map((item, i) => {
                    const active = i === suggestIndexRef.current;
                    return (
                      <Pressable
                        key={item.label}
                        accessibilityRole="button"
                        accessibilityLabel={`${item.label}: ${item.detail}`}
                        onPress={() => {
                          setSuggestOpen(false);
                          apply(acceptEdit(completions!, i));
                        }}
                        style={{
                          flexDirection: "row",
                          gap: 12,
                          paddingHorizontal: 10,
                          paddingVertical: 3,
                          backgroundColor: active ? withAlpha(c.accent, 0.2) : "transparent",
                        }}
                      >
                        <Text style={{ fontFamily: MONO, fontSize: 12, color: c.foreground }}>{item.label}</Text>
                        <Text style={{ fontSize: 12, color: c.foregroundMuted, flex: 1, textAlign: "right" }} numberOfLines={1}>
                          {item.detail}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {completions!.items.length > MAX_SUGGESTIONS ? (
                    <Text style={{ fontSize: 11, color: c.foregroundMuted, paddingHorizontal: 10, paddingTop: 2 }}>
                      {completions!.items.length - MAX_SUGGESTIONS} more, keep typing to filter
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
});
