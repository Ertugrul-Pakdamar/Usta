import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { expandMentions, listProjectFiles, rankFiles } from "./mentions.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-at-"));
  mkdirSync(join(cwd, "src"));
  mkdirSync(join(cwd, "node_modules/x"), { recursive: true });
  writeFileSync(join(cwd, "src/app.ts"), "export const a = 1;\n");
  writeFileSync(join(cwd, "src/util.ts"), "export const u = 2;\n");
  writeFileSync(join(cwd, "README.md"), "# hi\n");
  writeFileSync(join(cwd, ".env"), "SECRET=1");
  writeFileSync(join(cwd, ".env.example"), "SECRET=");
  writeFileSync(join(cwd, "server.pem"), "KEY");
  writeFileSync(join(cwd, "node_modules/x/i.js"), "x");
});

describe("listProjectFiles / rankFiles", () => {
  it("lists project files without dependencies or secrets", async () => {
    const files = await listProjectFiles(cwd);
    expect(files).toEqual([".env.example", "README.md", "src/app.ts", "src/util.ts"]);
  });

  it("ranks path prefix, then file-name prefix, then substring", () => {
    const files = ["docs/app.md", "src/app.ts", "app.ts", "src/other-app.ts", "x/y.ts"];
    expect(rankFiles(files, "app")).toEqual([
      "app.ts",
      "src/app.ts",
      "docs/app.md",
      "src/other-app.ts",
    ]);
    expect(rankFiles(files, "src/")).toEqual(["src/app.ts", "src/other-app.ts"]);
    expect(rankFiles(files, "nope")).toEqual([]);
    expect(rankFiles(files, "", 2)).toHaveLength(2);
  });
});

describe("expandMentions", () => {
  it("attaches existing project files and notes what was attached", () => {
    const r = expandMentions("explain @src/app.ts and @README.md, please", cwd);
    expect(r.attached.map((a) => a.path)).toEqual(["src/app.ts", "README.md"]);
    expect(r.text).toContain('<attached-file path="src/app.ts">\nexport const a = 1;');
    expect(r.text.startsWith("explain @src/app.ts and @README.md, please")).toBe(true);
  });

  it("leaves e-mail addresses, unknown paths, directories, binaries and repeats alone", () => {
    writeFileSync(join(cwd, "bin.dat"), Buffer.from([1, 0, 2]));
    const r = expandMentions(
      "mail me@example.com about @nope.ts @src @bin.dat @README.md @README.md",
      cwd,
    );
    expect(r.attached.map((a) => a.path)).toEqual(["README.md"]);
  });

  it("never attaches secrets, paths outside the project, or symlinks escaping it by name", () => {
    writeFileSync(join(cwd, "..", "outside-usta.txt"), "outside");
    symlinkSync(join(cwd, ".env"), join(cwd, "link.txt"));
    const r = expandMentions(
      "@.env @server.pem @../outside-usta.txt @/etc/hostname @.env.example",
      cwd,
    );
    expect(r.attached.map((a) => a.path)).toEqual([".env.example"]);
    expect(r.text).not.toContain("SECRET=1");
    // An innocently named symlink to a secret, or one pointing outside the project, is refused too.
    symlinkSync(join(cwd, "..", "outside-usta.txt"), join(cwd, "out-link.txt"));
    expect(expandMentions("@link.txt @out-link.txt", cwd).attached).toEqual([]);
  });

  it("cuts big files and tells the model how to get the rest; limits the number of files", () => {
    writeFileSync(join(cwd, "big.txt"), `${"line\n".repeat(10_000)}`);
    const r = expandMentions("@big.txt", cwd);
    expect(r.attached[0]).toMatchObject({ truncated: true, lines: 10_001 });
    expect(r.text).toContain('truncated="true" total-lines="10001"');
    expect(r.text.length).toBeLessThan(14_000);
    const many = Array.from({ length: 8 }, (_, i) => {
      writeFileSync(join(cwd, `f${i}.txt`), "x");
      return `@f${i}.txt`;
    }).join(" ");
    expect(expandMentions(many, cwd).attached).toHaveLength(5);
  });
});
