// Helpers shared by the evaluation tasks.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const write = (dir, rel, text) => {
  const file = join(dir, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};
export const read = (dir, rel) => readFileSync(join(dir, rel), "utf8");
export const pad = (n) => String(n).padStart(2, "0");

/** Runs `node args` in dir; { ok, out } instead of throwing. */
export const node = (dir, ...args) => {
  try {
    return {
      ok: true,
      out: execFileSync(process.execPath, args, {
        cwd: dir,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 20_000,
      }),
    };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
};
