import { useRpc, useSubscription } from "@getpaseo/plugin/client";
import { useCallback, useState } from "react";
import { type KeybindingsFile, watchKeybindingsFile, writeKeybindingsFile } from "../shared/contracts";

const NO_INPUT = {};

/** Live view of keybindings.json on the selected host, plus a compare-and-swap save. */
export function useKeybindingsFile() {
  const [file, setFile] = useState<KeybindingsFile | null>(null);
  const status = useSubscription(watchKeybindingsFile, NO_INPUT, setFile);
  const write = useRpc(writeKeybindingsFile);
  const save = useCallback(
    async (text: string, expectedRevision: string) => {
      const result = await write({ text, expectedRevision });
      setFile(result.file);
      return result;
    },
    [write],
  );
  return { file, status, save };
}
