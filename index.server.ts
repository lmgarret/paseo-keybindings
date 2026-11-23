import type { PluginServerContext } from "@getpaseo/plugin/server";
import * as store from "./server/store";
import { readKeybindingsFile, watchKeybindingsFile, writeKeybindingsFile } from "./shared/contracts";

export default function contribute(server: PluginServerContext) {
  const path = store.keybindingsPath();
  server.handle(readKeybindingsFile, () => store.readKeybindingsFile(path));
  server.handle(writeKeybindingsFile, ({ text, expectedRevision }) =>
    store.writeKeybindingsFile(path, text, expectedRevision),
  );
  server.handle(watchKeybindingsFile, (_input, { push, signal }) => {
    store.watchKeybindingsFile(path, (file) => void push(file), signal);
  });
  return () => {};
}
