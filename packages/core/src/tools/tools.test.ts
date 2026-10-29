import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  bashTool,
  clearReadCache,
  editTool,
  globTool,
  grepTool,
  readTool,
  writeTool,
} from "./index.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-"));
});

describe("Read", () => {
  it("numbers lines and honours offset/limit", async () => {
    await writeFile(join(cwd, "a.txt"), "x\ny\nz");
    const out = await readTool.run({ path: "a.txt", offset: 2, limit: 1 }, { cwd });
    expect(out).toContain("     2\ty");
    expect(out).toContain("1 more lines");
  });

  it("refuses secrets but allows .env.example", async () => {
    await writeFile(join(cwd, ".env"), "KEY=1");
    await writeFile(join(cwd, ".env.example"), "KEY=");
    await expect(readTool.run({ path: ".env" }, { cwd })).rejects.toThrow("Access denied");
    await expect(readTool.run({ path: ".env.example" }, { cwd })).resolves.toContain("KEY=");
  });
});

describe("Write/Edit", () => {
  it("creates parent directories", async () => {
    await writeTool.run({ path: "d/e/f.txt", content: "hi" }, { cwd });
    expect(await readFile(join(cwd, "d/e/f.txt"), "utf8")).toBe("hi");
  });

  it("requires a unique match unless replace_all", async () => {
    await writeFile(join(cwd, "a.txt"), "a a");
    const input = { path: "a.txt", old_string: "a", new_string: "b" };
    await expect(editTool.run(input, { cwd })).rejects.toThrow("occurs 2 times");
    await editTool.run({ ...input, replace_all: true }, { cwd });
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("b b");
  });

  it("does not interpret $ patterns in the replacement", async () => {
    await writeFile(join(cwd, "a.txt"), "foo");
    await editTool.run({ path: "a.txt", old_string: "foo", new_string: "$&$1" }, { cwd });
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("$&$1");
  });

  it("reports a missing match", async () => {
    await writeFile(join(cwd, "a.txt"), "foo");
    await expect(
      editTool.run({ path: "a.txt", old_string: "bar", new_string: "x" }, { cwd }),
    ).rejects.toThrow("was not found");
  });
});

describe("Glob/Grep", () => {
  it("finds files and matches, skipping node_modules and secrets", async () => {
    await mkdir(join(cwd, "src"));
    await mkdir(join(cwd, "node_modules"));
    await writeFile(join(cwd, "src/a.ts"), "const needle = 1;\n");
    await writeFile(join(cwd, "node_modules/b.ts"), "needle");
    await writeFile(join(cwd, ".env"), "needle=secret");
    expect(await globTool.run({ pattern: "**/*.ts" }, { cwd })).toBe("src/a.ts");
    expect(await grepTool.run({ pattern: "needle" }, { cwd })).toBe("src/a.ts:1:const needle = 1;");
  });

  it("rejects an invalid regex with a ToolError", async () => {
    await expect(grepTool.run({ pattern: "(" }, { cwd })).rejects.toThrow("Invalid regular");
  });
});

describe("Bash", () => {
  it("returns output and exit code", async () => {
    expect(await bashTool.run({ command: "echo hi; exit 3" }, { cwd })).toBe("hi\n[exit code 3]");
  });

  it("kills the process tree on timeout", async () => {
    const out = await bashTool.run({ command: "sleep 30 & sleep 30", timeout_ms: 200 }, { cwd });
    expect(out).toContain("timed out");
  });

  it("bounds memory for runaway output, keeping head and tail", async () => {
    const out = await bashTool.run(
      { command: "head -c 3000000 /dev/zero | tr '\\0' x; echo END" },
      { cwd },
    );
    expect(out).toContain("characters dropped");
    expect(out).toContain("END");
    expect(out.length).toBeLessThan(1_700_000);
  });
});

describe("preview", () => {
  it("shows an Edit diff before it is applied", async () => {
    await writeFile(join(cwd, "a.txt"), "one\ntwo\n");
    const diff = await editTool.preview?.(
      { path: "a.txt", old_string: "two", new_string: "2" },
      { cwd },
    );
    expect(diff).toContain("-two");
    expect(diff).toContain("+2");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("one\ntwo\n");
  });

  it("shows a new file as all additions and returns undefined for a bad Edit", async () => {
    expect(await writeTool.preview?.({ path: "n.txt", content: "hi\n" }, { cwd })).toContain("+hi");
    expect(
      await editTool.preview?.({ path: "missing.txt", old_string: "a", new_string: "b" }, { cwd }),
    ).toBeUndefined();
  });
});

describe("unifiedDiff", () => {
  it("omits the 'No newline at end of file' noise", async () => {
    const diff = await writeTool.preview?.({ path: "n.txt", content: "hi" }, { cwd });
    expect(diff).toContain("+hi");
    expect(diff).not.toContain("No newline");
  });
});

describe("Grep engines", () => {
  const prepare = async () => {
    await mkdir(join(cwd, "src"));
    await mkdir(join(cwd, "node_modules"));
    await writeFile(join(cwd, "src/b.ts"), "x\nneedle two\n");
    await writeFile(join(cwd, "src/a.ts"), "needle one\n");
    await writeFile(join(cwd, "node_modules/c.ts"), "needle");
    await writeFile(join(cwd, ".env"), "needle=secret");
  };
  const expected = "src/a.ts:1:needle one\nsrc/b.ts:2:needle two";

  it("ripgrep path: ordered output, secrets and node_modules excluded", async () => {
    await prepare();
    expect(await grepTool.run({ pattern: "needle" }, { cwd })).toBe(expected);
  });

  it("JS fallback gives the same answer", async () => {
    await prepare();
    process.env.USTA_NO_RG = "1";
    try {
      expect(await grepTool.run({ pattern: "needle" }, { cwd })).toBe(expected);
      expect(
        await grepTool.run({ pattern: "NEEDLE", ignore_case: true, glob: "src/*.ts" }, { cwd }),
      ).toBe(expected);
    } finally {
      process.env.USTA_NO_RG = undefined;
      delete process.env.USTA_NO_RG;
    }
  });

  it("falls back to JS for regex features rg rejects (lookahead)", async () => {
    await prepare();
    expect(await grepTool.run({ pattern: "needle(?= one)" }, { cwd })).toBe(
      "src/a.ts:1:needle one",
    );
  });
});

describe("Read cache", () => {
  it("answers 'unchanged' for the same range of an untouched file, until it changes", async () => {
    const state = new Map<string, unknown>();
    await writeFile(join(cwd, "a.txt"), "one\ntwo\n");
    const first = await readTool.run({ path: "a.txt" }, { cwd, state });
    expect(first).toContain("one");
    expect(await readTool.run({ path: "a.txt" }, { cwd, state })).toContain("Unchanged");
    expect(await readTool.run({ path: "a.txt", offset: 2 }, { cwd, state })).toContain("two");
    await writeFile(join(cwd, "a.txt"), "one\nTWO\nthree\n");
    expect(await readTool.run({ path: "a.txt" }, { cwd, state })).toContain("TWO");
  });

  it("forgets everything when cleared (after compaction)", async () => {
    const state = new Map<string, unknown>();
    await writeFile(join(cwd, "a.txt"), "x");
    await readTool.run({ path: "a.txt" }, { cwd, state });
    clearReadCache(state);
    expect(await readTool.run({ path: "a.txt" }, { cwd, state })).toContain("x");
  });

  it("stops at the character cap and says where to continue", async () => {
    await writeFile(join(cwd, "big.txt"), `${"z".repeat(1000)}\n`.repeat(100));
    const out = await readTool.run({ path: "big.txt" }, { cwd });
    expect(out.length).toBeLessThan(30_000);
    expect(out).toMatch(/more lines \(offset=\d+\)/);
  });
});
