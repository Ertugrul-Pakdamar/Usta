// The checks must reject an untouched project and accept a correct solution: otherwise the
// evaluation would measure the checks, not the agent.
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pad, read, write } from "./lib.mjs";
import { tasks } from "./tasks/index.mjs";

const fresh = (task) => {
  const dir = mkdtempSync(join(tmpdir(), "usta-evalcheck-"));
  task.setup(dir);
  return dir;
};
const sub = (dir, rel, from, to) => write(dir, rel, read(dir, rel).replaceAll(from, to));

const SOLUTIONS = {
  "bulk-rename": [
    (d) =>
      [
        "users.js",
        "main.js",
        ...Array.from({ length: 12 }, (_, i) => `src/m${pad(i + 1)}.js`),
      ].forEach((f) => sub(d, f, "getUser", "fetchUser")),
    "done",
  ],
  "bulk-header": [
    (d) =>
      Array.from({ length: 15 }, (_, i) => `src/f${pad(i + 1)}.js`).forEach((f) =>
        write(d, f, `// Copyright (c) Acme Corp\n${read(d, f)}`),
      ),
    "done",
  ],
  "bulk-version": [
    (d) =>
      Array.from({ length: 10 }, (_, i) => `config/svc${pad(i + 1)}.json`).forEach((f) =>
        sub(d, f, "1.2.3", "1.3.0"),
      ),
    "done",
  ],
  "fix-bug": [(d) => sub(d, "stats.js", "let i = 1;", "let i = 0;"), "done"],
  "add-feature": [
    (d) =>
      write(
        d,
        "slug.js",
        'export function slugify(t) { return t.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }\n',
      ),
    "done",
  ],
  "find-answer": [() => {}, "It is lib/billing/tax.js and the reduced rate is 0.075."],
  "big-log-count": [() => {}, null],
  "create-cli": [
    (d) =>
      write(
        d,
        "wc.js",
        'let s="";process.stdin.on("data",c=>s+=c).on("end",()=>console.log(s.split("\\n").length-1, s.split(/\\s+/).filter(Boolean).length));\n',
      ),
    "done",
  ],
  "review-project": [
    () => {},
    "Found change-me-in-production as a default secret, dangerouslySetInnerHTML in FormEditor and HS256 signing.",
  ],
  "csv-to-json": [
    (d) => {
      const [, ...rows] = read(d, "people.csv").trim().split("\n");
      write(
        d,
        "people.json",
        JSON.stringify(
          rows.map((r) => {
            const [name, age, city] = r.split(",");
            return { name, age: Number(age), city };
          }),
        ),
      );
    },
    "done",
  ],
};

describe("evaluation tasks", () => {
  it("covers every task with a reference solution", () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(tasks.map((t) => t.id).sort());
  });

  for (const task of tasks) {
    it(`${task.id}: rejects the untouched project and accepts a correct solution`, () => {
      const before = fresh(task);
      expect(task.check(before, "I did not do anything").ok).toBe(false);

      const dir = fresh(task);
      const [solve, answer] = SOLUTIONS[task.id];
      solve(dir);
      const text = answer ?? `The count is ${read(dir, ".expected").trim()}.`;
      const verdict = task.check(dir, text);
      expect(verdict.ok, verdict.detail).toBe(true);
    });
  }

  it("a wrong answer to the log question is rejected", () => {
    const task = tasks.find((t) => t.id === "big-log-count");
    const dir = fresh(task);
    expect(task.check(dir, "There are 12345 of them").ok).toBe(false);
    expect(readdirSync(dir)).toContain("server.log");
  });
});
