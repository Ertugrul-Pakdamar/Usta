// Stop: if the working tree adds a "TODO(usta)" marker, tell the agent to resolve it first.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8" });

export default function noOpenTodos(event) {
  if (event.stopHookActive) return; // already continued once: do not nag forever
  let added = [];
  try {
    // Lines added to tracked files, plus the content of new (untracked) files.
    added = git(event.cwd, "diff", "HEAD", "-U0")
      .split("\n")
      .filter((l) => l.startsWith("+"));
    for (const file of git(event.cwd, "ls-files", "--others", "--exclude-standard").split("\n")) {
      if (!file) continue;
      try {
        added.push(...readFileSync(join(event.cwd, file), "utf8").slice(0, 100_000).split("\n"));
      } catch {} // unreadable or binary: skip
    }
  } catch {
    return; // not a git repository
  }
  const open = added.filter((l) => l.includes("TODO(usta)"));
  if (open.length) {
    return {
      decision: "block",
      reason: `${open.length} TODO(usta) marker(s) were added and not resolved. Finish them or remove the markers.`,
    };
  }
}
