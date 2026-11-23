import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon, ScrollView, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { KeybindingsFile } from "../shared/contracts";
import { COMMAND_CATALOG, CONTEXT_CATALOG } from "./catalog";
import { CodeEditor, type CodeEditorHandle } from "./code-editor";
import { format, lineColumnAt } from "./jsonc";
import { Banner, Button, MONO } from "./ui-common";
import { useKeybindingsFile } from "./use-keybindings-file";
import { analyzeUserKeybindings, appendBinding, NEW_FILE_TEMPLATE } from "./user-bindings";

export interface JsonNavigation {
  openShortcuts(): void;
}

const initialText = (file: KeybindingsFile) => (file.exists ? file.text : NEW_FILE_TEMPLATE);

export function createJsonScreen(navigation: JsonNavigation) {
  return function KeybindingsJsonScreen({ theme, layout, params }: PluginScreenProps) {
    const c = theme.colors;
    const toast = useToast();
    const { file, save } = useKeybindingsFile();
    const editor = useRef<CodeEditorHandle>(null);
    const [base, setBase] = useState<KeybindingsFile | null>(null);
    const [draft, setDraft] = useState<string | null>(null);
    const [diskChange, setDiskChange] = useState<KeybindingsFile | null>(null);
    const [saving, setSaving] = useState(false);
    const [showReference, setShowReference] = useState(!layout.compact);
    const revealedEntry = useRef(false);

    const dirty = base !== null && draft !== null && (!base.exists || draft !== base.text);

    // Follow the file on disk; keep local edits and offer a choice when both changed.
    useEffect(() => {
      if (!file) return;
      if (!base || draft === null) {
        setBase(file);
        setDraft(initialText(file));
        return;
      }
      if (file.revision === base.revision) return;
      if (draft === initialText(base)) {
        setBase(file);
        setDraft(initialText(file));
        setDiskChange(null);
      } else {
        setDiskChange(file);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [file]);

    const text = draft ?? "";
    const analysis = useMemo(() => analyzeUserKeybindings(text), [text]);
    const diagnostics = analysis.diagnostics;
    const errors = diagnostics.filter((d) => d.severity === "error").length;
    const warnings = diagnostics.length - errors;

    // ?entry=N (from the table's "Show in JSON") selects that entry once loaded.
    useEffect(() => {
      const index = Number(params.entry);
      if (revealedEntry.current || draft === null || params.entry === undefined || !Number.isInteger(index)) return;
      const entry = analysis.entries[index];
      if (!entry) return;
      revealedEntry.current = true;
      setTimeout(() => editor.current?.reveal(entry.start, entry.end), 50);
    }, [analysis, draft, params.entry]);

    const doSave = async () => {
      if (!base || draft === null || saving) return;
      setSaving(true);
      try {
        const result = await save(draft, base.revision);
        if (result.status === "saved") {
          setBase(result.file);
          setDiskChange(null);
          toast.show(errors ? `Saved with ${errors} error${errors === 1 ? "" : "s"}` : "Saved", {
            variant: errors ? "warning" : "success",
          });
        } else {
          setDiskChange(result.file);
          toast.show("keybindings.json changed on disk. Choose which version to keep.", { variant: "warning" });
        }
      } catch (error) {
        toast.error(`Could not save: ${(error as Error).message}`);
      } finally {
        setSaving(false);
      }
    };

    const doFormat = () => {
      if (draft === null) return;
      const formatted = format(draft);
      if (formatted === null) {
        toast.show("Fix syntax errors before formatting", { variant: "warning" });
        return;
      }
      if (formatted === draft) return;
      const caret = Math.min(editor.current?.selection().end ?? 0, formatted.length);
      editor.current?.apply({ start: 0, end: draft.length, insert: formatted, selectionStart: caret, selectionEnd: caret });
    };

    const insertCommand = (command: string, args?: Record<string, unknown>) => {
      if (draft === null) return;
      if (!analysis.editable) {
        toast.show("Fix the errors in the file first", { variant: "warning" });
        return;
      }
      const edit = appendBinding(draft, analysis, { key: "", command, ...(args ? { args } : {}) });
      // Replace only what changed so the caret lands inside the new "key" value.
      let prefix = 0;
      while (prefix < draft.length && draft[prefix] === edit.text[prefix]) prefix++;
      let suffix = 0;
      while (
        suffix < draft.length - prefix &&
        draft[draft.length - 1 - suffix] === edit.text[edit.text.length - 1 - suffix]
      )
        suffix++;
      const keyAt = edit.text.indexOf('"key": ""', edit.range?.start ?? 0) + '"key": "'.length;
      editor.current?.apply({
        start: prefix,
        end: draft.length - suffix,
        insert: edit.text.slice(prefix, edit.text.length - suffix),
        selectionStart: keyAt,
        selectionEnd: keyAt,
      });
      setTimeout(() => editor.current?.reveal(keyAt), 0);
    };

    const insertAtCaret = (value: string) => {
      const sel = editor.current?.selection() ?? { start: text.length, end: text.length };
      editor.current?.apply({ start: sel.start, end: sel.end, insert: value, selectionStart: sel.start + value.length, selectionEnd: sel.start + value.length });
    };

    const muted = { color: c.foregroundMuted, fontSize: 12 };
    const sectionTitle = { color: c.foreground, fontSize: 12, fontWeight: "600" as const, textTransform: "uppercase" as const };

    if (!file || draft === null || !base) {
      return (
        <View style={{ flex: 1, padding: 24, backgroundColor: c.surface0 }}>
          <Text style={muted}>Loading keybindings.json…</Text>
        </View>
      );
    }

    return (
      <View style={{ flex: 1, backgroundColor: c.surface0 }}>
        {/* Toolbar */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: layout.compact ? 12 : 16,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
          }}
        >
          <View style={{ flex: 1, minWidth: 160, flexDirection: "row", alignItems: "center", gap: 6 }}>
            {dirty ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.foreground }} /> : null}
            <Text style={[muted, { fontFamily: MONO }]} numberOfLines={1}>
              {base.path}
              {base.exists ? "" : " (new file)"}
            </Text>
          </View>
          <Button theme={theme} icon="Save" label={base.exists ? "Save" : "Create"} variant="primary" disabled={!dirty || saving} onPress={() => void doSave()} />
          <Button theme={theme} icon="Undo2" label={layout.compact ? undefined : "Revert"} accessibilityLabel="Revert to the saved file" disabled={!dirty} onPress={() => setDraft(initialText(base))} />
          <Button theme={theme} icon="AlignLeft" label={layout.compact ? undefined : "Format"} accessibilityLabel="Format document" disabled={!analysis.editable} onPress={doFormat} />
          <Button theme={theme} icon="BookOpen" variant={showReference ? "primary" : "secondary"} accessibilityLabel="Toggle commands and contexts reference" onPress={() => setShowReference((s) => !s)} />
          <Button theme={theme} icon="Keyboard" label={layout.compact ? undefined : "Keyboard Shortcuts"} accessibilityLabel="Open Keyboard Shortcuts" onPress={navigation.openShortcuts} />
        </View>

        {diskChange ? (
          <View style={{ padding: 8 }}>
            <Banner
              theme={theme}
              tone="warning"
              actions={
                <View style={{ flexDirection: "row", gap: 6 }}>
                  <Button
                    theme={theme}
                    label="Load from disk"
                    onPress={() => {
                      setBase(diskChange);
                      setDraft(initialText(diskChange));
                      setDiskChange(null);
                    }}
                  />
                  <Button
                    theme={theme}
                    label="Keep mine"
                    onPress={() => {
                      setBase(diskChange);
                      setDiskChange(null);
                    }}
                  />
                </View>
              }
            >
              keybindings.json changed on disk while you were editing.
            </Banner>
          </View>
        ) : null}

        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ flex: 1 }}>
            <CodeEditor ref={editor} theme={theme} value={draft} onChangeText={setDraft} diagnostics={diagnostics} onSave={() => void doSave()} onFormat={doFormat} />
          </View>
          {showReference ? (
            <View
              style={
                layout.compact
                  ? { position: "absolute", top: 0, right: 0, bottom: 0, left: 40, backgroundColor: c.surface1, borderLeftWidth: 1, borderLeftColor: c.border }
                  : { width: 300, backgroundColor: c.surface1, borderLeftWidth: 1, borderLeftColor: c.border }
              }
            >
              <ScrollView contentContainerStyle={{ padding: 12, gap: 6 }}>
                <Text style={sectionTitle}>Commands</Text>
                <Text style={muted}>Press to append a binding.</Text>
                {COMMAND_CATALOG.map((command) => (
                  <Pressable
                    key={command.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Add a binding for ${command.title}`}
                    onPress={() => insertCommand(command.id, "args" in command ? { ...command.args } : undefined)}
                    style={({ pressed }) => ({ paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text style={{ color: c.foreground, fontSize: 13 }}>{command.title}</Text>
                    <Text style={[muted, { fontFamily: MONO }]}>{command.id}</Text>
                    <Text style={[muted, { fontSize: 11 }]}>{command.description}</Text>
                  </Pressable>
                ))}
                <Text style={[sectionTitle, { marginTop: 12 }]}>When contexts</Text>
                <Text style={muted}>Press to insert at the cursor. Combine with !, &&, ||, ( ).</Text>
                {CONTEXT_CATALOG.map((context) => (
                  <Pressable
                    key={context.name}
                    accessibilityRole="button"
                    accessibilityLabel={`Insert ${context.name}`}
                    onPress={() => insertAtCaret(context.name)}
                    style={({ pressed }) => ({ paddingVertical: 4, opacity: pressed ? 0.6 : 1 })}
                  >
                    <Text style={{ color: c.foreground, fontFamily: MONO, fontSize: 12 }}>{context.name}</Text>
                    <Text style={[muted, { fontSize: 11 }]}>{context.description}</Text>
                  </Pressable>
                ))}
                <Text style={[sectionTitle, { marginTop: 12 }]}>Editor keys</Text>
                <Text style={muted}>
                  Cmd/Ctrl+S save · Shift+Alt+F format · Cmd/Ctrl+/ comment · Tab/Shift+Tab indent · Ctrl+Space suggest
                </Text>
              </ScrollView>
            </View>
          ) : null}
        </View>

        {/* Problems */}
        <View style={{ maxHeight: layout.compact ? 120 : 160, borderTopWidth: 1, borderTopColor: c.border }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={sectionTitle}>Problems</Text>
            <Icon name="CircleX" size={13} color={errors ? c.statusDanger : c.foregroundMuted} />
            <Text style={muted}>{errors}</Text>
            <Icon name="TriangleAlert" size={13} color={warnings ? c.statusWarning : c.foregroundMuted} />
            <Text style={muted}>{warnings}</Text>
          </View>
          <ScrollView>
            {diagnostics.length === 0 ? (
              <Text style={[muted, { paddingHorizontal: 12, paddingBottom: 8 }]}>No problems.</Text>
            ) : (
              diagnostics.map((d, i) => {
                const pos = lineColumnAt(text, d.start);
                return (
                  <Pressable
                    key={`${d.start}-${i}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${d.severity} at line ${pos.line + 1}: ${d.message}`}
                    onPress={() => editor.current?.reveal(d.start, d.end)}
                    style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 3, opacity: pressed ? 0.6 : 1 })}
                  >
                    <Icon
                      name={d.severity === "error" ? "CircleX" : "TriangleAlert"}
                      size={13}
                      color={d.severity === "error" ? c.statusDanger : c.statusWarning}
                    />
                    <Text style={{ color: c.foreground, fontSize: 12, flex: 1 }}>{d.message}</Text>
                    <Text style={muted}>
                      Ln {pos.line + 1}, Col {pos.column + 1}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    );
  };
}
