import type { PluginTheme } from "@getpaseo/plugin";
import { Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CONTEXT_CATALOG, commandInfo } from "./catalog";
import { parse, toValue } from "./jsonc";
import type { Keybinding } from "./keybindings";
import { formatChord, parseChord } from "./keys";
import { Button, KeyCaps, MONO } from "./ui-common";
import { canRecordKeys, recordKeys } from "./web";
import { compileWhen, whenIdentifiers } from "./when";

export interface BindingDialogProps {
  theme: PluginTheme;
  open: boolean;
  title: string;
  command: string;
  initial: { key: string; when?: string; args?: unknown };
  onSave(binding: Keybinding): void;
  onClose(): void;
}

function validateKey(key: string): string | null {
  if (!key.trim()) return "Press Record or type a key, e.g. ctrl+shift+c";
  try {
    parseChord(key);
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

function validateWhen(when: string): { error: string | null; warning: string | null } {
  try {
    compileWhen(when);
  } catch (error) {
    return { error: (error as Error).message, warning: null };
  }
  const unknown = whenIdentifiers(when)
    .map((i) => i.name)
    .filter((name) => !CONTEXT_CATALOG.some((c) => c.name === name));
  return { error: null, warning: unknown.length ? `Unknown context: ${unknown.join(", ")} (always false)` : null };
}

/** Changes or adds a keybinding: key (typed or recorded), when clause, and args. */
export function BindingDialog({ theme, open, title, command, initial, onSave, onClose }: BindingDialogProps) {
  const c = theme.colors;
  const info = commandInfo(command.replace(/^-/, ""));
  const takesArgs = initial.args !== undefined || info?.args !== undefined;
  const [key, setKey] = useState(initial.key);
  const [when, setWhen] = useState(initial.when ?? "");
  const [argsText, setArgsText] = useState("");
  const [recording, setRecording] = useState(false);
  const stopRecording = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!open) return;
    setKey(initial.key);
    setWhen(initial.when ?? "");
    const args = initial.args ?? info?.args;
    setArgsText(args === undefined ? "" : JSON.stringify(args, null, 2));
    setRecording(false);
    // Reset only when the dialog opens for a new row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, initial.key, initial.when]);

  useEffect(() => {
    if (!recording) return;
    const stop = recordKeys({
      onChord: (chord) => setKey(formatChord(chord)),
      onEnter: () => setRecording(false),
      onEscape: () => setRecording(false),
    });
    stopRecording.current = stop;
    return () => {
      stop();
      stopRecording.current = null;
    };
  }, [recording]);

  const keyError = validateKey(key);
  const whenCheck = useMemo(() => validateWhen(when), [when]);
  const argsCheck = useMemo(() => {
    if (!takesArgs || argsText.trim() === "") return { error: null as string | null, value: undefined as unknown };
    const parsed = parse(argsText);
    if (parsed.error) return { error: parsed.error.message, value: undefined };
    return { error: null, value: parsed.root ? toValue(parsed.root) : undefined };
  }, [argsText, takesArgs]);
  const valid = !keyError && !whenCheck.error && !argsCheck.error;

  const save = () => {
    if (!valid) return;
    const binding: Keybinding = { key: formatChord(parseChord(key)), command };
    if (when.trim()) binding.when = when.trim();
    if (argsCheck.value !== undefined) binding.args = argsCheck.value;
    onSave(binding);
  };

  const label = { color: c.foreground, fontSize: 13, fontWeight: "600" as const };
  const hint = { color: c.foregroundMuted, fontSize: 12 };
  const input = {
    color: c.foreground,
    fontFamily: MONO,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface1,
  };
  const message = (text: string | null, color: string) =>
    text ? <Text style={{ color, fontSize: 12 }}>{text}</Text> : null;

  return (
    <Modal
      title={title}
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          stopRecording.current?.();
          onClose();
        }
      }}
    >
      <Modal.Content>
        <View style={{ gap: 6 }}>
          <Text style={label}>Keybinding</Text>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              value={key}
              onChangeText={setKey}
              editable={!recording}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="ctrl+shift+c"
              placeholderTextColor={c.foregroundMuted}
              style={[input, { flex: 1 }]}
              accessibilityLabel="Keybinding"
              onSubmitEditing={save}
            />
            {canRecordKeys ? (
              <Button
                theme={theme}
                icon={recording ? "CircleStop" : "Keyboard"}
                label={recording ? "Stop" : "Record"}
                variant={recording ? "primary" : "secondary"}
                onPress={() => setRecording((r) => !r)}
              />
            ) : null}
          </View>
          {recording ? <Text style={hint}>Press the key combination, then Enter. Escape cancels.</Text> : null}
          {!keyError ? <KeyCaps theme={theme} value={key} /> : message(keyError, recording ? c.foregroundMuted : c.statusDanger)}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={label}>When</Text>
          <TextInput
            value={when}
            onChangeText={setWhen}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="always"
            placeholderTextColor={c.foregroundMuted}
            style={input}
            accessibilityLabel="When expression"
            onSubmitEditing={save}
          />
          {message(whenCheck.error, c.statusDanger)}
          {message(whenCheck.warning, c.statusWarning)}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {CONTEXT_CATALOG.map((context) => (
              <Pressable
                key={context.name}
                accessibilityRole="button"
                accessibilityLabel={`Add ${context.name}: ${context.description}`}
                onPress={() => setWhen((w) => (w.trim() ? `${w.trim()} && ${context.name}` : context.name))}
                style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: c.surface2 }}
              >
                <Text style={{ color: c.foregroundMuted, fontFamily: MONO, fontSize: 11 }}>{context.name}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {takesArgs ? (
          <View style={{ gap: 6 }}>
            <Text style={label}>Args (JSON)</Text>
            <TextInput
              value={argsText}
              onChangeText={setArgsText}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              style={[input, { minHeight: 80, textAlignVertical: "top" }]}
              accessibilityLabel="Command arguments"
            />
            {message(argsCheck.error, c.statusDanger)}
            {info?.description ? <Text style={hint}>{info.description}</Text> : null}
          </View>
        ) : null}

        <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
          <Button theme={theme} label="Cancel" variant="ghost" onPress={onClose} />
          <Button theme={theme} label="Save" variant="primary" disabled={!valid} onPress={save} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
