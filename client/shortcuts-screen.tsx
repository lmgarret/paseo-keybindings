import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { FlatList, Icon, TextInput, useToast } from "@getpaseo/plugin/client/ui";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { BindingDialog } from "./binding-dialog";
import { DEFAULT_KEYBINDINGS } from "./defaults";
import type { Keybinding } from "./keybindings";
import { formatChord } from "./keys";
import {
  addBinding,
  buildRows,
  editRow,
  filterRows,
  hasUserEntries,
  parseQuery,
  removeRow,
  resetCommand,
  type RowSource,
  rowKeys,
  type ShortcutRow,
  SOURCES,
  type SortColumn,
  type SortOrder,
  sortRows,
  toggleSourceFilter,
} from "./table-model";
import { Banner, Button, KeyCaps, MONO, withAlpha } from "./ui-common";
import { useKeybindingsFile } from "./use-keybindings-file";
import { analyzeUserKeybindings, type TextEdit } from "./user-bindings";
import { appPlatform, canRecordKeys, readPaseoOverrides, recordKeys } from "./web";

export interface ShortcutsNavigation {
  openJson(entry?: number): void;
}

type DialogState = { mode: "edit" | "add"; row: ShortcutRow } | null;

const SOURCE_LABELS: Record<RowSource, string> = { user: "User", default: "Default", paseo: "Paseo", unbound: "Unbound" };

function RowActions({
  theme,
  row,
  canReset,
  disabled,
  onEdit,
  onAdd,
  onRemove,
  onReset,
  onShowJson,
}: {
  theme: PluginTheme;
  row: ShortcutRow;
  canReset: boolean;
  disabled: boolean;
  onEdit(): void;
  onAdd(): void;
  onRemove(): void;
  onReset(): void;
  onShowJson(): void;
}) {
  const action = (icon: string, label: string, onPress: () => void, show = true) =>
    show ? (
      <Button key={label} theme={theme} icon={icon} variant="ghost" accessibilityLabel={label} disabled={disabled} onPress={onPress} />
    ) : null;
  if (row.readOnly) return null;
  return (
    <View style={{ flexDirection: "row", gap: 2 }}>
      {action("Pencil", `Change keybinding for ${row.title}`, onEdit, row.source !== "unbound")}
      {action("Plus", `Add keybinding for ${row.title}`, onAdd)}
      {action("Trash2", `Remove keybinding for ${row.title}`, onRemove, row.source !== "unbound")}
      {action("RotateCcw", `Reset keybindings for ${row.title}`, onReset, canReset)}
      {row.source === "user" ? (
        <Button theme={theme} icon="Braces" variant="ghost" accessibilityLabel="Show in keybindings.json" onPress={onShowJson} />
      ) : null}
    </View>
  );
}

export function createShortcutsScreen(navigation: ShortcutsNavigation) {
  return function ShortcutsScreen({ theme, layout }: PluginSurfaceProps) {
    const c = theme.colors;
    const toast = useToast();
    const { file, save } = useKeybindingsFile();
    const [query, setQuery] = useState("");
    const [recordingSearch, setRecordingSearch] = useState(false);
    const [recordedKey, setRecordedKey] = useState<string | undefined>();
    // Set from a row's collision warning: shows every binding on that row's keys.
    const [keyFilter, setKeyFilter] = useState<{ key: string; keys: string[] } | null>(null);
    const [dialog, setDialog] = useState<DialogState>(null);
    const [saving, setSaving] = useState(false);
    // undefined: by title, the table's natural order.
    const [sort, setSort] = useState<SortOrder | undefined>();

    const text = file?.text ?? "";
    const user = useMemo(() => analyzeUserKeybindings(text), [text]);
    // Paseo's bindings with the rebinds saved in its settings; read once per visit of the screen.
    const paseo = useMemo(() => {
      const platform = appPlatform();
      return platform ? { platform, overrides: readPaseoOverrides() } : undefined;
    }, []);
    const rows = useMemo(() => buildRows(DEFAULT_KEYBINDINGS, user, paseo), [user, paseo]);
    const visible = useMemo(() => {
      const filtered = filterRows(rows, query, recordedKey ?? keyFilter?.keys);
      return sort ? sortRows(filtered, sort) : filtered;
    }, [rows, query, recordedKey, keyFilter, sort]);
    const activeSources = useMemo(() => parseQuery(query).fields.source ?? [], [query]);
    // Header clicks cycle ascending → descending → back to the natural order.
    const cycleSort = (column: SortColumn) =>
      setSort((current) =>
        current?.column !== column ? { column } : current.descending ? undefined : { column, descending: true },
      );
    const errorCount = user.diagnostics.filter((d) => d.severity === "error").length;
    const readOnly = !file || !user.editable || saving;

    useEffect(() => {
      if (!recordingSearch) return;
      return recordKeys({
        onChord: (chord) => setRecordedKey(formatChord(chord)),
        onEscape: () => setRecordingSearch(false),
      });
    }, [recordingSearch]);

    const apply = async (makeEdit: () => TextEdit, success: string) => {
      if (!file) return;
      setSaving(true);
      try {
        const edit = makeEdit();
        const result = await save(edit.text, file.revision);
        if (result.status === "conflict") toast.show("keybindings.json changed on disk. Try again.", { variant: "warning" });
        else toast.show(success, { variant: "success" });
      } catch (error) {
        toast.error(`Could not update keybindings.json: ${(error as Error).message}`);
      } finally {
        setSaving(false);
      }
    };

    const onDialogSave = (binding: Keybinding) => {
      const current = dialog;
      setDialog(null);
      if (!current) return;
      if (current.mode === "add") void apply(() => addBinding(text, user, binding), "Keybinding added");
      else void apply(() => editRow(text, user, current.row, binding), "Keybinding updated");
    };

    const compact = layout.compact;
    const cell = { color: c.foreground, fontSize: 13 };
    const muted = { color: c.foregroundMuted, fontSize: 12 };

    const renderRow = ({ item: row }: { item: ShortcutRow }) => {
      const canReset = hasUserEntries(user, row.command);
      const actions = (
        <RowActions
          theme={theme}
          row={row}
          canReset={canReset}
          disabled={readOnly}
          onEdit={() => setDialog({ mode: "edit", row })}
          onAdd={() => setDialog({ mode: "add", row })}
          onRemove={() => void apply(() => removeRow(text, user, row), "Keybinding removed")}
          onReset={() => void apply(() => resetCommand(text, user, row.command), "Keybindings reset")}
          onShowJson={() => navigation.openJson(row.entryIndex)}
        />
      );
      const isPaseo = row.source === "paseo";
      const key = row.key ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <KeyCaps theme={theme} value={row.key} />
          {row.digits ? <Text style={muted}>… 9</Text> : null}
        </View>
      ) : (
        <Text style={muted}>—</Text>
      );
      // Pressing a collision warning lists every binding on the row's keys.
      const collision = (prefix: string, titles: string[]) => (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={`${prefix} ${titles.join(", ")}. Show bindings on ${row.key}`}
          onPress={() => {
            setRecordingSearch(false);
            setRecordedKey(undefined);
            setKeyFilter({ key: row.key, keys: rowKeys(row) });
          }}
        >
          {(state) => (
            <Text
              style={{
                color: c.statusWarning,
                fontSize: 11,
                // `hovered` exists on react-native-web only.
                textDecorationLine: (state as { hovered?: boolean }).hovered ? "underline" : "none",
              }}
              numberOfLines={2}
            >
              {prefix} {titles.join(", ")}
            </Text>
          )}
        </Pressable>
      );
      const conflicts = isPaseo ? (
        row.conflicts.length > 0 ? collision(row.menu === "blocks" ? "Blocks" : "Overridden by", row.conflicts) : null
      ) : (
        <>
          {row.blockedBy?.length ? collision("Never runs, Paseo's menu takes the key:", row.blockedBy) : null}
          {row.conflicts.length > 0 ? collision("Also on this key:", row.conflicts) : null}
          {row.shadows.length > 0 ? collision("Overrides Paseo:", row.shadows) : null}
        </>
      );
      const isUser = row.source === "user";
      const source = (
        <Text style={[muted, isUser ? { color: c.accent, fontWeight: "600" } : null]}>
          {row.source === "unbound" ? "" : SOURCE_LABELS[row.source]}
        </Text>
      );
      // User rows get an accent bar on the left, like VS Code's "modified" marker in its settings editor.
      const marker = { borderLeftWidth: 2, borderLeftColor: isUser ? c.accent : "transparent" };
      const condition = row.when ?? row.note ?? "";
      const conditionStyle = row.note && !row.when ? { fontStyle: "italic" as const } : { fontFamily: MONO };
      const onPress = () => {
        if (row.readOnly) toast.show(row.readOnly);
        else if (!readOnly) setDialog({ mode: row.source === "unbound" ? "add" : "edit", row });
      };

      if (compact) {
        return (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${row.title}, ${row.key || "unbound"}`}
            style={{ padding: 12, paddingLeft: 10, gap: 6, borderBottomWidth: 1, borderBottomColor: c.border, ...marker }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={[cell, { fontWeight: "600", flex: 1 }]}>{row.title}</Text>
              {source}
            </View>
            <Text style={[muted, { fontFamily: MONO }]}>{row.command}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {key}
              {conflicts}
            </View>
            {row.when ? <Text style={[muted, { fontFamily: MONO }]}>when {row.when}</Text> : null}
            {row.note ? <Text style={[muted, conditionStyle]}>{row.note}</Text> : null}
            {actions}
          </Pressable>
        );
      }
      return (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`${row.title}, ${row.key || "unbound"}`}
          style={(state) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingLeft: 14,
            paddingRight: 16,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
            ...marker,
            // `hovered` exists on react-native-web only.
            backgroundColor: (state as { hovered?: boolean }).hovered || state.pressed ? withAlpha(c.accent, 0.06) : "transparent",
          })}
        >
          <View style={{ flex: 3, minWidth: 0 }}>
            <Text style={cell} numberOfLines={1}>
              {row.title}
            </Text>
            <Text style={[muted, { fontFamily: MONO }]} numberOfLines={1}>
              {row.command}
            </Text>
          </View>
          <View style={{ flex: 2, gap: 2 }}>
            {key}
            {conflicts}
          </View>
          <Text style={[muted, { flex: 3 }, conditionStyle]} numberOfLines={2}>
            {condition}
          </Text>
          <View style={{ width: 60 }}>{source}</View>
          <View style={{ width: 150, alignItems: "flex-end" }}>{actions}</View>
        </Pressable>
      );
    };

    const header = (label: string, column: SortColumn, style: object) => {
      const active = sort?.column === column;
      const direction = active ? (sort.descending ? "descending" : "ascending") : undefined;
      return (
        <Pressable
          onPress={() => cycleSort(column)}
          accessibilityRole="button"
          accessibilityLabel={`Sort by ${label}${direction ? `, ${direction}` : ""}`}
          style={[{ flexDirection: "row", alignItems: "center", gap: 4 }, style]}
        >
          <Text style={[muted, { fontWeight: "600", textTransform: "uppercase", fontSize: 11 }, active ? { color: c.foreground } : null]}>
            {label}
          </Text>
          {active ? <Icon name={sort.descending ? "ArrowDown" : "ArrowUp"} size={12} color={c.foreground} /> : null}
        </Pressable>
      );
    };

    const sourceChip = (source: RowSource) => {
      const active = activeSources.includes(source);
      return (
        <Pressable
          key={source}
          onPress={() => {
            setRecordingSearch(false);
            setRecordedKey(undefined);
            setKeyFilter(null);
            setQuery((q) => toggleSourceFilter(q, source));
          }}
          accessibilityRole="button"
          accessibilityState={{ selected: active }}
          accessibilityLabel={`Show ${SOURCE_LABELS[source]} keybindings`}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: active ? c.accent : c.border,
            backgroundColor: active ? withAlpha(c.accent, 0.12) : "transparent",
          }}
        >
          <Text style={[muted, { fontSize: 11 }, active ? { color: c.accent } : null]}>{SOURCE_LABELS[source]}</Text>
        </Pressable>
      );
    };

    return (
      <View style={{ flex: 1, backgroundColor: c.surface0 }}>
        <View style={{ padding: compact ? 12 : 16, gap: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: recordingSearch ? c.accent : c.border,
                backgroundColor: c.surface1,
              }}
            >
              <Icon name={recordingSearch ? "Keyboard" : "Search"} size={14} color={c.foregroundMuted} />
              {keyFilter && !recordingSearch ? (
                <View style={{ flex: 1, paddingVertical: 4, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={muted}>Bindings on</Text>
                  <KeyCaps theme={theme} value={keyFilter.key} />
                  {keyFilter.keys.length > 1 ? <Text style={muted}>… 9</Text> : null}
                  <View style={{ flex: 1 }} />
                  <Button
                    theme={theme}
                    icon="X"
                    variant="ghost"
                    accessibilityLabel="Clear key filter"
                    onPress={() => setKeyFilter(null)}
                  />
                </View>
              ) : recordingSearch ? (
                <View style={{ flex: 1, paddingVertical: 7, flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {recordedKey ? (
                    <KeyCaps theme={theme} value={recordedKey} />
                  ) : (
                    <Text style={muted}>Press a key combination to find its bindings (Escape to stop)</Text>
                  )}
                </View>
              ) : (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search keybindings (@source:user, @command:, @keybinding:, @when:)"
                  placeholderTextColor={c.foregroundMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  accessibilityLabel="Search keybindings"
                  style={{ flex: 1, color: c.foreground, fontSize: 13, paddingVertical: 7 }}
                />
              )}
            </View>
            {canRecordKeys ? (
              <Button
                theme={theme}
                icon="Keyboard"
                label={compact ? undefined : recordingSearch ? "Stop" : "Record Keys"}
                accessibilityLabel="Search by recorded keys"
                variant={recordingSearch ? "primary" : "secondary"}
                onPress={() => {
                  setRecordedKey(undefined);
                  setKeyFilter(null);
                  setRecordingSearch((r) => !r);
                }}
              />
            ) : null}
            <Button
              theme={theme}
              icon="Braces"
              label={compact ? undefined : "Open JSON"}
              accessibilityLabel="Open keybindings.json"
              onPress={() => navigation.openJson()}
            />
          </View>
          {file && !user.editable ? (
            <Banner
              theme={theme}
              tone="danger"
              actions={<Button theme={theme} label="Fix in JSON" onPress={() => navigation.openJson()} />}
            >
              keybindings.json has {errorCount} error{errorCount === 1 ? "" : "s"}. Editing here is disabled until it parses.
            </Banner>
          ) : user.diagnostics.length > 0 ? (
            <Banner
              theme={theme}
              tone="warning"
              actions={<Button theme={theme} label="Show problems" onPress={() => navigation.openJson()} />}
            >
              {user.diagnostics.length} problem{user.diagnostics.length === 1 ? "" : "s"} in keybindings.json. Invalid entries are ignored.
            </Banner>
          ) : null}
          <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Text style={[muted, { flexShrink: 1 }]}>
              {file ? `${file.path}${file.exists ? "" : " (not created yet)"}` : "Loading…"} · {visible.length} of {rows.length}
            </Text>
            <View style={{ flex: 1 }} />
            <View style={{ flexDirection: "row", gap: 4 }}>{SOURCES.map(sourceChip)}</View>
          </View>
        </View>
        {compact ? null : (
          <View style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border }}>
            {header("Command", "command", { flex: 3 })}
            {header("Keybinding", "key", { flex: 2 })}
            {header("When", "when", { flex: 3 })}
            {header("Source", "source", { width: 60 })}
            <View style={{ width: 150 }} />
          </View>
        )}
        <FlatList
          data={visible}
          keyExtractor={(row) => row.id}
          renderItem={renderRow}
          ListEmptyComponent={<Text style={[muted, { padding: 16 }]}>No keybindings match.</Text>}
        />
        {dialog ? (
          <BindingDialog
            theme={theme}
            open
            title={`${dialog.mode === "add" ? "Add" : "Change"} keybinding: ${dialog.row.title}`}
            command={dialog.row.command}
            initial={
              dialog.mode === "add"
                ? { key: "", args: dialog.row.args }
                : { key: dialog.row.key, when: dialog.row.when, args: dialog.row.args }
            }
            bindingsOn={(key) =>
              filterRows(rows, "", key).filter((row) => dialog.mode === "add" || row.id !== dialog.row.id)
            }
            onSave={onDialogSave}
            onClose={() => setDialog(null)}
          />
        ) : null}
      </View>
    );
  };
}
