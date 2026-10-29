import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { CheckpointStore } from "./checkpoint.js";

let dir: string;
let home: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "usta-ck-"));
  home = await mkdtemp(join(tmpdir(), "usta-ck-home-"));
});

describe("CheckpointStore", () => {
  it("restores modified files and deletes files that did not exist", async () => {
    const a = join(dir, "a.txt");
    const b = join(dir, "b.txt");
    await writeFile(a, "v1");
    const ck = CheckpointStore.open("s1", home);
    ck.beginTurn(0, "turn one");
    ck.record(a);
    await writeFile(a, "v2");
    ck.record(b);
    await writeFile(b, "new");
    const r = ck.rewind(1);
    expect(await readFile(a, "utf8")).toBe("v1");
    expect(existsSync(b)).toBe(false);
    expect(r).toMatchObject({ messageCount: 0, restored: [a], deleted: [b] });
  });

  it("records only the first change per turn and undoes turns newest-first", async () => {
    const a = join(dir, "a.txt");
    await writeFile(a, "v1");
    const ck = CheckpointStore.open("s2", home);
    ck.beginTurn(0, "one");
    ck.record(a);
    await writeFile(a, "v2");
    ck.record(a);
    await writeFile(a, "v2b");
    ck.beginTurn(4, "two");
    ck.record(a);
    await writeFile(a, "v3");
    expect(ck.rewind(1)?.messageCount).toBe(4);
    expect(await readFile(a, "utf8")).toBe("v2b");
    expect(ck.rewind(5)?.messageCount).toBe(0);
    expect(await readFile(a, "utf8")).toBe("v1");
    expect(ck.rewind()).toBeUndefined();
  });

  it("a turn without file changes still rewinds the conversation", () => {
    const ck = CheckpointStore.open("s3", home);
    ck.beginTurn(2, "talk only");
    expect(ck.rewind()).toMatchObject({ messageCount: 2, restored: [], deleted: [] });
  });

  it("persists across reopen (resumed sessions)", async () => {
    const a = join(dir, "a.txt");
    await writeFile(a, "v1");
    const ck = CheckpointStore.open("s4", home);
    ck.beginTurn(0, "one");
    ck.record(a);
    await writeFile(a, "v2");
    CheckpointStore.open("s4", home).rewind();
    expect(await readFile(a, "utf8")).toBe("v1");
  });

  it("keeps message counts consistent after the conversation was compacted", () => {
    const ck = CheckpointStore.open("s5", home);
    ck.beginTurn(0, "old");
    ck.beginTurn(10, "kept");
    ck.shiftAfterCompaction(6); // first 6 messages became 1 summary
    expect(ck.list().map((t) => t.messageCount)).toEqual([1, 5]);
  });
});
