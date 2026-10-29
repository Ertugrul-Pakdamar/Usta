import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createOutputLimiter, pruneOldOutputs } from "./output-limit.js";
import { bashTool, readTool } from "./tools/index.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "usta-out-"));
});
const call = { id: "call/1:x", name: "Bash", arguments: "{}" };

describe("createOutputLimiter", () => {
  it("leaves small outputs alone", () => {
    const limit = createOutputLimiter({ dir: () => dir, maxChars: 100 });
    expect(limit(bashTool, call, "short")).toBe("short");
  });

  it("keeps head and tail and saves the full output with a pointer", async () => {
    const limit = createOutputLimiter({ dir: () => dir, maxChars: 100 });
    const full = `HEAD${"x".repeat(500)}TAIL`;
    const out = limit(bashTool, call, full);
    expect(out.length).toBeLessThan(full.length);
    expect(out.startsWith("HEAD")).toBe(true);
    expect(out.endsWith("TAIL")).toBe(true);
    expect(out).toContain("characters omitted");
    const files = await readdir(dir);
    expect(files).toEqual(["call_1_x.txt"]);
    expect(await readFile(join(dir, files[0] as string), "utf8")).toBe(full);
    expect(out).toContain(join(dir, "call_1_x.txt"));
  });

  it("truncates without a pointer when there is nowhere to save, and for Read", async () => {
    const big = "y".repeat(500);
    expect(
      createOutputLimiter({ dir: () => undefined, maxChars: 100 })(bashTool, call, big),
    ).toContain("characters omitted. ]");
    const out = createOutputLimiter({ dir: () => dir, maxChars: 100 })(
      readTool,
      { ...call, name: "Read" },
      big,
    );
    expect(out).toContain("smaller limit");
    expect(await readdir(dir)).toEqual([]);
  });

  it("honours per-tool limits", () => {
    const limit = createOutputLimiter({ dir: () => dir, maxChars: 100, perTool: { Bash: 1000 } });
    expect(limit(bashTool, call, "z".repeat(500))).toBe("z".repeat(500));
  });
});

describe("pruneOldOutputs", () => {
  it("removes session folders older than the limit and keeps recent ones", async () => {
    const { mkdir, writeFile, utimes } = await import("node:fs/promises");
    const root = join(dir, ".usta", "outputs");
    await mkdir(join(root, "old"), { recursive: true });
    await mkdir(join(root, "fresh"), { recursive: true });
    await writeFile(join(root, "old", "a.txt"), "x");
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000);
    await utimes(join(root, "old"), tenDaysAgo, tenDaysAgo);
    pruneOldOutputs(dir, 7);
    expect(await readdir(root)).toEqual(["fresh"]);
  });

  it("does nothing when nothing was ever saved", () => {
    expect(() => pruneOldOutputs(dir)).not.toThrow();
  });
});
