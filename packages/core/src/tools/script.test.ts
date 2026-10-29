import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReviewRequest, ReviewVerdict } from "@usta/sdk";
import { beforeEach, describe, expect, it } from "vitest";
import { createReviewer } from "../gate.js";
import { PermissionEngine } from "../permissions.js";
import { scriptTool } from "./index.js";

let cwd: string;
beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-script-test-"));
  await mkdir(join(cwd, "sub"));
  await mkdir(join(cwd, "node_modules"));
  await writeFile(join(cwd, "a.txt"), "foo one\n");
  await writeFile(join(cwd, "sub/b.txt"), "foo two\nkeep\n");
  await writeFile(join(cwd, "node_modules/x.txt"), "foo vendored\n");
  await writeFile(join(cwd, ".env"), "SECRET=foo\n");
});

const REPLACE = `
import pathlib
for p in pathlib.Path('.').rglob('*.txt'):
    t = p.read_text()
    if 'foo' in t:
        p.write_text(t.replace('foo', 'bar'))
`;

const read = (p: string) => readFile(join(cwd, p), "utf8");
const yes = async (): Promise<ReviewVerdict> => ({ ok: true });

function run(
  language: "python" | "node",
  code: string,
  review?: (r: ReviewRequest) => Promise<ReviewVerdict>,
) {
  return scriptTool.run({ language, code }, { cwd, review });
}

describe("Script", () => {
  it("runs on a copy, shows the diff for review, then applies after approval", async () => {
    let seen: ReviewRequest | undefined;
    const out = await run("python", REPLACE, async (r) => ((seen = r), { ok: true }));
    expect(seen?.summary).toBe("2 files (2 modified, 0 added, 0 deleted)");
    expect(seen?.diff).toContain("modified: a.txt");
    expect(seen?.diff).toContain("-foo one");
    expect(seen?.diff).toContain("+bar one");
    expect(seen?.paths.sort()).toEqual([join(cwd, "a.txt"), join(cwd, "sub/b.txt")]);
    expect(out).toContain("Applied 2 files");
    expect(out).toContain("Estimated tokens");
    expect(await read("a.txt")).toBe("bar one\n");
    expect(await read("sub/b.txt")).toBe("bar two\nkeep\n");
  });

  it("applies nothing when the review is declined", async () => {
    const out = await run("python", REPLACE, async () => ({
      ok: false,
      reason: "the user declined",
    }));
    expect(out).toContain("NOT applied: the user declined");
    expect(await read("a.txt")).toBe("foo one\n");
  });

  it("applies nothing when there is nobody to review", async () => {
    const out = await run("python", REPLACE);
    expect(out).toContain("NOT applied");
    expect(await read("a.txt")).toBe("foo one\n");
  });

  it("never sees secrets or vendored directories", async () => {
    const out = await run(
      "python",
      "import os\nprint(os.path.exists('.env'), os.path.exists('node_modules'), os.path.exists('a.txt'))",
      yes,
    );
    expect(out).toContain("False False True");
    expect(out).toContain("no changes");
  });

  it("handles added and deleted files, with node (cjs and esm)", async () => {
    const cjs = await run(
      "node",
      "const fs=require('fs'); fs.unlinkSync('a.txt'); fs.writeFileSync('new.txt','hi\\n');",
      yes,
    );
    expect(cjs).toContain("D a.txt");
    expect(cjs).toContain("A new.txt");
    expect(existsSync(join(cwd, "a.txt"))).toBe(false);
    expect(await read("new.txt")).toBe("hi\n");
    const esm = await run(
      "node",
      "import fs from 'node:fs'; fs.writeFileSync('esm.txt','x');",
      yes,
    );
    expect(esm).toContain("A esm.txt");
  });

  it("a failing script changes nothing and is never reviewed", async () => {
    let asked = false;
    const out = await run(
      "python",
      "open('a.txt','w').write('x')\nraise SystemExit(3)",
      async () => ((asked = true), { ok: true }),
    );
    expect(out).toContain("failed (exit 3)");
    expect(asked).toBe(false);
    expect(await read("a.txt")).toBe("foo one\n");
  });

  it("refuses to overwrite edits made while the user was reviewing", async () => {
    const slowReview = async (): Promise<ReviewVerdict> => {
      await writeFile(join(cwd, "a.txt"), "edited meanwhile\n");
      return { ok: true };
    };
    await expect(run("python", REPLACE, slowReview)).rejects.toThrow(
      "changed while you were reviewing",
    );
    expect(await read("a.txt")).toBe("edited meanwhile\n");
    expect(await read("sub/b.txt")).toBe("foo two\nkeep\n"); // all-or-nothing
  });
});

describe("permissions for script changes", () => {
  const review = (
    engine: PermissionEngine,
    paths: string[],
    ask?: Parameters<typeof createReviewer>[0]["ask"],
  ) =>
    createReviewer({ engine, ask })(
      scriptTool,
      { id: "c", name: "Script", arguments: "{}" },
      { summary: "s", diff: "d", paths },
    );

  it("Edit/Write deny rules apply to every file the script touched, even in bypass", async () => {
    const e = new PermissionEngine({ cwd, mode: "bypass", deny: ["Edit(sub/**)"] });
    expect(await review(e, [join(cwd, "a.txt"), join(cwd, "sub/b.txt")])).toMatchObject({
      ok: false,
      reason: expect.stringContaining("sub/b.txt"),
    });
  });

  it("asks in default mode, applies automatically in acceptEdits, never in plan mode", async () => {
    const paths = [join(cwd, "a.txt")];
    const asked: string[] = [];
    const ask = async (r: { kind: string }) => (asked.push(r.kind), { allow: true });
    expect(await review(new PermissionEngine({ cwd, mode: "default" }), paths, ask)).toEqual({
      ok: true,
    });
    expect(asked).toEqual(["review"]);
    asked.length = 0;
    expect(await review(new PermissionEngine({ cwd, mode: "acceptEdits" }), paths, ask)).toEqual({
      ok: true,
    });
    expect(asked).toEqual([]);
    expect(await review(new PermissionEngine({ cwd, mode: "plan" }), paths, ask)).toMatchObject({
      ok: false,
    });
  });

  it("without an interactive asker a needed approval becomes a refusal", async () => {
    expect(
      await review(new PermissionEngine({ cwd, mode: "default" }), [join(cwd, "a.txt")]),
    ).toMatchObject({ ok: false });
  });

  it("protected paths ask even in acceptEdits; outside paths ask; allow rules can pre-approve", async () => {
    const ask = async () => ({ allow: false });
    expect(
      await review(
        new PermissionEngine({ cwd, mode: "acceptEdits" }),
        [join(cwd, ".usta/settings.json")],
        ask,
      ),
    ).toMatchObject({ ok: false });
    expect(
      await review(
        new PermissionEngine({ cwd, mode: "acceptEdits" }),
        ["/tmp/outside-usta-test.txt"],
        ask,
      ),
    ).toMatchObject({ ok: false });
    const preApproved = new PermissionEngine({ cwd, mode: "default", allow: ["Edit(sub/**)"] });
    expect(await review(preApproved, [join(cwd, "sub/b.txt")])).toEqual({ ok: true });
  });

  it("Script itself is blocked in plan mode and asks otherwise", () => {
    expect(
      new PermissionEngine({ cwd, mode: "plan" }).decide(scriptTool, {
        language: "python",
        code: "x",
      }).decision,
    ).toBe("deny");
    expect(
      new PermissionEngine({ cwd, mode: "acceptEdits" }).decide(scriptTool, {
        language: "python",
        code: "x",
      }).decision,
    ).toBe("ask");
  });
});
