import type { PluginClientContext } from "@getpaseo/plugin/client";
import { Platform } from "react-native";
import { watchKeybindingsFile } from "./shared/contracts";
import { DEFAULT_KEYBINDINGS } from "./client/defaults";
import { createJsonScreen } from "./client/json-screen";
import { createShortcutsScreen } from "./client/shortcuts-screen";
import { analyzeUserKeybindings } from "./client/user-bindings";
import { installKeybindings } from "./client/web";

const SHORTCUTS = "shortcuts";
const JSON_EDITOR = "shortcuts-json";

export default function contribute(client: PluginClientContext) {
  // The key listener uses defaults until the user's keybindings.json arrives, then follows it live.
  const controller = installKeybindings(DEFAULT_KEYBINDINGS);
  const release =
    Platform.OS === "web"
      ? client.subscribe(watchKeybindingsFile, {}, (file) => {
          const user = analyzeUserKeybindings(file.text);
          controller.setBindings([...DEFAULT_KEYBINDINGS, ...user.bindings]);
          const errors = user.diagnostics.filter((d) => d.severity === "error");
          if (errors.length) console.warn(`[keybindings] ${file.path}: ${errors.length} error(s); invalid entries ignored`);
        })
      : () => {};

  const openShortcuts = () => client.openScreen({ screenId: SHORTCUTS });
  const openJson = (entry?: number) =>
    client.openScreen({ screenId: JSON_EDITOR, params: entry === undefined ? {} : { entry: String(entry) } });
  const ShortcutsScreen = createShortcutsScreen({ openJson });

  client.addScreen({ id: SHORTCUTS, title: "Keyboard Shortcuts", Component: ShortcutsScreen });
  client.addScreen({ id: JSON_EDITOR, title: "keybindings.json", Component: createJsonScreen({ openShortcuts }) });
  client.addSettingsScreen({ id: "keybindings", title: "Keyboard Shortcuts", icon: "Keyboard", Component: ShortcutsScreen });
  client.addCommandCenterItem({
    id: "open-keyboard-shortcuts",
    title: "Preferences: Open Keyboard Shortcuts",
    icon: "Keyboard",
    keywords: ["keybindings", "shortcuts", "keys", "hotkeys"],
    context: "global",
    onSelect: ({ openScreen }) => openScreen({ screenId: SHORTCUTS }),
  });
  client.addCommandCenterItem({
    id: "open-keyboard-shortcuts-json",
    title: "Preferences: Open Keyboard Shortcuts (JSON)",
    icon: "Braces",
    keywords: ["keybindings.json", "keybindings", "shortcuts", "json"],
    context: "global",
    onSelect: ({ openScreen }) => openScreen({ screenId: JSON_EDITOR }),
  });

  return () => {
    release();
    controller.dispose();
  };
}
