/// <reference types="node" />
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { KeybindingsFile } from "../shared/contracts";
import { readKeybindingsFile, watchKeybindingsFile, writeKeybindingsFile } from "../server/store";

let dir: string;
let path: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "keybindings-"));
  path = join(dir, "keybindings.json");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("store", () => {
  it("reads a missing file", async () => {
    expect(await readKeybindingsFile(path)).toEqual({ path, exists: false, text: "", revision: "missing" });
  });

  it("writes with compare-and-swap", async () => {
    const saved = await writeKeybindingsFile(path, "[]", "missing");
    expect(saved.status).toBe("saved");
    expect(await readKeybindingsFile(path)).toEqual(saved.file);

    const stale = await writeKeybindingsFile(path, "[1]", "missing");
    expect(stale).toEqual({ status: "conflict", file: saved.file });

    const next = await writeKeybindingsFile(path, "[2]", saved.file.revision);
    expect(next.file.text).toBe("[2]");
  });

  it("pushes the file on start and after changes", async () => {
    const events: KeybindingsFile[] = [];
    const controller = new AbortController();
    watchKeybindingsFile(path, (file) => events.push(file), controller.signal);
    await expect.poll(() => events.length).toBe(1);
    expect(events[0].exists).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 100));
    await writeFile(path, "[]");
    await expect.poll(() => events.at(-1)?.text, { timeout: 3000 }).toBe("[]");

    controller.abort();
    const count = events.length;
    await writeFile(path, "[3]");
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events.length).toBe(count);
  });
});
