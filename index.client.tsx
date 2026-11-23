import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DEFAULT_KEYBINDINGS } from "./client/defaults";
import { installKeybindings } from "./client/web";

export default function contribute(_client: PluginClientContext) {
  return installKeybindings(DEFAULT_KEYBINDINGS);
}
