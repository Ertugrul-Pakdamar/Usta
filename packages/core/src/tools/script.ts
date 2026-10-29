import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { defineTool, ToolError, z } from "@usta/sdk";
import { unifiedDiff } from "./diff.js";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".usta",
  "__pycache__",
  ".venv",
  "venv",
  ".next",
  "target",
]);
const SECRET = /^\.env(\..*)?$|\.(pem|key|p12|pfx)$/;
const MAX_FILE_BYTES = 1_000_000;
const MAX_COPY_BYTES = 150_000_000;
const MAX_CHANGE_BYTES = 30_000_000;
const SCRIPT_TIMEOUT_MS = 60_000;
const OUTPUT_CAP = 20_000;
/** Rough chars per token, only for the "by hand vs by script" comparison. */
const CHARS_PER_TOKEN = 3.2;
const CALL_OVERHEAD_TOKENS = 220;

export interface FileChange {
  /** Path relative to the project root, posix separators. */
  path: string;
  kind: "modified" | "added" | "deleted";
  before?: Buffer;
  after?: Buffer;
}

const isText = (b: Buffer | undefined) => !b?.includes(0);

// --- sandbox copy -------------------------------------------------------------------

interface Snapshot {
  size: number;
  mtimeMs: number;
}

/** Copies the project (minus secrets, vendored dirs, symlinks, big files) and records stats. */
async function copyProject(src: string, dest: string): Promise<Map<string, Snapshot>> {
  const snapshot = new Map<string, Snapshot>();
  let total = 0;
  async function walk(rel: string): Promise<void> {
    for (const entry of await readdir(join(src, rel), { withFileTypes: true })) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          await mkdir(join(dest, relPath), { recursive: true });
          await walk(relPath);
        }
      } else if (entry.isFile() && !SECRET.test(entry.name)) {
        const info = await stat(join(src, relPath));
        if (info.size > MAX_FILE_BYTES) continue;
        total += info.size;
        if (total > MAX_COPY_BYTES)
          throw new ToolError("Project is too large to copy for a sandbox run.");
        await copyFile(join(src, relPath), join(dest, relPath));
        const copy = await stat(join(dest, relPath));
        snapshot.set(relPath, { size: copy.size, mtimeMs: copy.mtimeMs });
      }
    }
  }
  await walk("");
  return snapshot;
}

async function listFiles(root: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(root, relPath)));
    else if (entry.isFile()) out.push(relPath);
  }
  return out;
}

async function readIfExists(path: string): Promise<Buffer | undefined> {
  try {
    return await readFile(path);
  } catch {
    return undefined;
  }
}

/** What the script changed in the sandbox relative to the real project. */
async function collectChanges(
  real: string,
  sandbox: string,
  snapshot: Map<string, Snapshot>,
): Promise<FileChange[]> {
  const changes: FileChange[] = [];
  let bytes = 0;
  const keep = (c: FileChange) => {
    bytes += (c.before?.length ?? 0) + (c.after?.length ?? 0);
    if (bytes > MAX_CHANGE_BYTES)
      throw new ToolError("The script changed too much data to review.");
    changes.push(c);
  };
  const present = new Set(await listFiles(sandbox));
  for (const [path, snap] of snapshot) {
    if (!present.has(path)) {
      keep({ path, kind: "deleted", before: await readIfExists(join(real, path)) });
      continue;
    }
    const now = await stat(join(sandbox, path));
    if (now.size === snap.size && now.mtimeMs === snap.mtimeMs) continue;
    const [before, after] = await Promise.all([
      readIfExists(join(real, path)),
      readFile(join(sandbox, path)),
    ]);
    if (!before?.equals(after)) keep({ path, kind: "modified", before, after });
  }
  for (const path of present) {
    if (snapshot.has(path) || SECRET.test(path.split("/").pop() ?? "")) continue;
    keep({ path, kind: "added", after: await readFile(join(sandbox, path)) });
  }
  return changes.sort((a, b) => (a.path < b.path ? -1 : 1));
}

// --- running ------------------------------------------------------------------------

function run(cmd: string, args: string[], cwd: string, signal?: AbortSignal) {
  return new Promise<{ code: number | null; output: string; timedOut: boolean }>((resolveRun) => {
    const child = spawn(cmd, args, {
      cwd,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, USTA_SANDBOX: "1" },
    });
    let output = "";
    let timedOut = false;
    const kill = () => {
      try {
        if (child.pid) process.kill(-child.pid, "SIGKILL");
      } catch {}
    };
    const timer = setTimeout(() => {
      timedOut = true;
      kill();
    }, SCRIPT_TIMEOUT_MS);
    signal?.addEventListener("abort", kill, { once: true });
    const collect = (b: Buffer) => {
      if (output.length < OUTPUT_CAP * 5) output += b.toString("utf8");
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("error", (err) => {
      output += `\n${err.message}`;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveRun({ code, output, timedOut });
    });
  });
}

const lineStats = (c: FileChange): string => {
  if (!isText(c.before) || !isText(c.after)) return "binary";
  const diff = unifiedDiff(
    c.path,
    c.before?.toString("utf8") ?? "",
    c.after?.toString("utf8") ?? "",
  );
  const lines = diff.split("\n");
  const plus = lines.filter((l) => l.startsWith("+") && !l.startsWith("+++")).length;
  const minus = lines.filter((l) => l.startsWith("-") && !l.startsWith("---")).length;
  return `+${plus} -${minus}`;
};

const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Estimated tokens to make `changes` by hand (one tool call per file) vs by one script. */
export function estimateSavings(changes: FileChange[], code: string) {
  const diffChars = changes.reduce(
    (n, c) =>
      n +
      (isText(c.before) && isText(c.after)
        ? unifiedDiff(c.path, c.before?.toString("utf8") ?? "", c.after?.toString("utf8") ?? "")
            .length
        : 200),
    0,
  );
  const manual = Math.ceil(diffChars / CHARS_PER_TOKEN) + changes.length * CALL_OVERHEAD_TOKENS;
  const script = Math.ceil(code.length / CHARS_PER_TOKEN) + CALL_OVERHEAD_TOKENS;
  return { manual, script };
}

const letter = { modified: "M", added: "A", deleted: "D" } as const;

/** Unified diff of every change, with a header line per file. */
function describeChanges(changes: FileChange[]): string {
  return changes
    .map((f) => {
      const head = `${f.kind === "added" ? "new file" : f.kind === "deleted" ? "deleted" : "modified"}: ${f.path}`;
      if (!isText(f.before) && f.before) return `${head} (binary)`;
      if (!isText(f.after) && f.after) return `${head} (binary)`;
      return `${head}\n${unifiedDiff(f.path, f.before?.toString("utf8") ?? "", f.after?.toString("utf8") ?? "")}`;
    })
    .join("\n\n");
}

export const scriptTool = defineTool({
  name: "Script",
  description:
    "Run a python or node script on a COPY of the project (secrets, node_modules and .git excluded). The user then reviews the resulting file changes as a diff and, if approved, they are applied. Use it for the same change across many files.",
  permission: { kind: "command", target: (i) => i.language },
  mutating: true,
  input: z.object({
    language: z.enum(["python", "node"]),
    code: z.string().min(1),
  }),
  preview: async ({ code }) =>
    code
      .split("\n")
      .map((l) => `+${l}`)
      .join("\n"),
  async run({ language, code }, ctx) {
    const sandbox = await mkdtemp(join(tmpdir(), "usta-script-"));
    const started = Date.now();
    try {
      const project = join(sandbox, "project");
      await mkdir(project);
      const snapshot = await copyProject(ctx.cwd, project);

      const ext =
        language === "python" ? "py" : /^\s*import\s|^\s*export\s/m.test(code) ? "mjs" : "cjs";
      const file = join(sandbox, `script.${ext}`);
      await writeFile(file, code);
      const result = await run(
        language === "python" ? "python3" : "node",
        [file],
        project,
        ctx.signal,
      );
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      const out =
        result.output.length > OUTPUT_CAP
          ? `${result.output.slice(0, OUTPUT_CAP)}\n… [output cut]`
          : result.output;

      if (result.timedOut)
        return `Script timed out after ${SCRIPT_TIMEOUT_MS / 1000}s. Nothing was changed.\n${out}`.trim();
      if (result.code !== 0)
        return `Script failed (exit ${result.code}). Nothing was changed.\n${out}`.trim();

      const changes = await collectChanges(ctx.cwd, project, snapshot);
      const head = `Script finished in ${secs}s.${out.trim() ? `\nOutput:\n${out.trim()}` : ""}`;
      if (!changes.length) return `${head}\nThe script made no changes to project files.`;

      const count = (k: FileChange["kind"]) => changes.filter((c) => c.kind === k).length;
      const summary = `${changes.length} files (${count("modified")} modified, ${count("added")} added, ${count("deleted")} deleted)`;
      const list = changes
        .slice(0, 40)
        .map((c) => `  ${letter[c.kind]} ${c.path} (${lineStats(c)})`);
      if (changes.length > 40) list.push(`  … ${changes.length - 40} more`);
      const { manual, script } = estimateSavings(changes, code);
      const tokens = `Estimated tokens: by hand ~${fmtTokens(manual)}, by this script ~${fmtTokens(script)}.`;

      // Nothing is written until the user (or a permission rule) has seen the diff.
      const verdict = ctx.review
        ? await ctx.review({
            summary,
            diff: describeChanges(changes),
            paths: changes.map((c) => resolve(ctx.cwd, c.path)),
          })
        : ({ ok: false, reason: "nobody can review the changes in this context" } as const);
      if (!verdict.ok) {
        return [
          head,
          `Changes made by the script: ${summary}:`,
          ...list,
          `NOT applied: ${verdict.reason ?? "the user declined"}. The project is unchanged.`,
        ].join("\n");
      }

      // The user may have taken a while; never overwrite edits made in the meantime.
      const conflicts: string[] = [];
      for (const f of changes) {
        const current = await readIfExists(join(ctx.cwd, f.path));
        const same =
          f.kind === "added"
            ? current === undefined || current.equals(f.after as Buffer)
            : current?.equals(f.before as Buffer);
        if (!same) conflicts.push(f.path);
      }
      if (conflicts.length) {
        throw new ToolError(
          `Not applied: these files changed while you were reviewing: ${conflicts.slice(0, 10).join(", ")}. Run the script again.`,
        );
      }
      for (const f of changes) {
        const target = join(ctx.cwd, f.path);
        if (f.kind === "deleted") await rm(target, { force: true });
        else {
          await mkdir(dirname(target), { recursive: true });
          await writeFile(target, f.after as Buffer);
        }
      }
      return [head, `Applied ${summary}:`, ...list, tokens].join("\n");
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  },
});
