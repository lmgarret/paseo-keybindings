/// <reference types="node" />
import { createHash } from "node:crypto";
import { watch } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { KeybindingsFile } from "../shared/contracts";

/** `<paseo home>/keybindings.json`, next to the daemon's config.json. */
export function keybindingsPath(): string {
  const home = process.env.PASEO_HOME || join(homedir(), ".paseo");
  return join(home, "keybindings.json");
}

const revisionOf = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 16);

export async function readKeybindingsFile(path: string): Promise<KeybindingsFile> {
  try {
    const text = await readFile(path, "utf8");
    return { path, exists: true, text, revision: revisionOf(text) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { path, exists: false, text: "", revision: "missing" };
    throw error;
  }
}

/** Compare-and-swap write; atomic through a temp file and rename. */
export async function writeKeybindingsFile(
  path: string,
  text: string,
  expectedRevision: string,
): Promise<{ status: "saved" | "conflict"; file: KeybindingsFile }> {
  const current = await readKeybindingsFile(path);
  if (current.revision !== expectedRevision) return { status: "conflict", file: current };
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, text, "utf8");
  await rename(temp, path);
  return { status: "saved", file: { path, exists: true, text, revision: revisionOf(text) } };
}

/**
 * Calls `onChange` with the current file, then after each change on disk. Watches the directory
 * so creation, deletion, and editors that replace the file are all seen.
 */
export function watchKeybindingsFile(
  path: string,
  onChange: (file: KeybindingsFile) => void,
  signal: AbortSignal,
): void {
  let last: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const emit = async () => {
    try {
      const file = await readKeybindingsFile(path);
      if (signal.aborted || file.revision === last) return;
      last = file.revision;
      onChange(file);
    } catch (error) {
      console.error("[keybindings] read failed", error);
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void emit(), 50);
  };

  void emit();
  const name = basename(path);
  mkdir(dirname(path), { recursive: true })
    .then(() => {
      if (signal.aborted) return;
      const watcher = watch(dirname(path), (_event, file) => {
        if (!file || file.toString() === name) schedule();
      });
      watcher.on("error", (error) => console.error("[keybindings] watch failed", error));
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        watcher.close();
      });
    })
    .catch((error) => console.error("[keybindings] watch failed", error));
}
