import { defineRpc, defineSubscription } from "@getpaseo/plugin";
import { z } from "zod";

export const KeybindingsFileSchema = z.object({
  /** Absolute path on the daemon host. */
  path: z.string(),
  exists: z.boolean(),
  text: z.string(),
  /** Content hash, or "missing" when the file does not exist. */
  revision: z.string(),
});
export type KeybindingsFile = z.infer<typeof KeybindingsFileSchema>;

export const readKeybindingsFile = defineRpc({
  name: "keybindings.read",
  input: z.object({}),
  output: KeybindingsFileSchema,
});

/** Writes when the file still has `expectedRevision`; otherwise returns the current file. */
export const writeKeybindingsFile = defineRpc({
  name: "keybindings.write",
  input: z.object({ text: z.string(), expectedRevision: z.string() }),
  output: z.object({ status: z.enum(["saved", "conflict"]), file: KeybindingsFileSchema }),
});

/** Pushes the file on subscribe and after every change on disk. */
export const watchKeybindingsFile = defineSubscription({
  name: "keybindings.watch",
  input: z.object({}),
  event: KeybindingsFileSchema,
});
