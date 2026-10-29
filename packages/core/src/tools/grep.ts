import { spawn, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { defineTool, ToolError, z } from "@usta/sdk";
import fg from "fast-glob";
import { IGNORE } from "./glob.js";
import { resolvePath } from "./paths.js";

const MAX_MATCHES = 200;
const SECRET_FILES = ["**/.env", "**/.env.*", "**/*.pem", "**/*.key"];

let rgChecked: boolean | undefined;
/** ripgrep is used when installed (fast, honours .gitignore); otherwise a JS fallback runs. */
function rgAvailable(): boolean {
  if (process.env.USTA_NO_RG) return false;
  rgChecked ??= spawnSync("rg", ["--version"], { stdio: "ignore" }).status === 0;
  return rgChecked;
}

interface Search {
  pattern: string;
  root: string;
  glob: string;
  ignoreCase?: boolean;
}

/** Returns undefined when rg cannot handle the request (e.g. regex syntax rg rejects). */
function searchWithRg({ pattern, root, glob, ignoreCase }: Search): Promise<string[] | undefined> {
  const excludes = [...IGNORE, ...SECRET_FILES].flatMap((g) => ["-g", `!${g}`]);
  const args = [
    "--line-number",
    "--no-heading",
    "--color=never",
    "--hidden",
    "--max-columns=300",
    "-g",
    "!.git",
    ...excludes,
    ...(glob !== "**/*" ? ["-g", glob] : []),
    ...(ignoreCase ? ["-i"] : []),
    "-e",
    pattern,
    "--",
    ".",
  ];
  return new Promise((resolve) => {
    const child = spawn("rg", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    child.stdout.on("data", (b: Buffer) => {
      if (out.length < 5_000_000) out += b.toString("utf8");
    });
    child.on("error", () => resolve(undefined));
    child.on("close", (code) => {
      if (code === 0 || code === 1) {
        resolve(
          out
            .split("\n")
            .filter(Boolean)
            .map((l) => l.replace(/^\.\//, "")),
        );
      } else resolve(undefined);
    });
  });
}

async function searchWithJs({ pattern, root, glob, ignoreCase }: Search): Promise<string[]> {
  const re = new RegExp(pattern, ignoreCase ? "i" : "");
  const files = (
    await fg(glob, { cwd: root, ignore: [...IGNORE, ...SECRET_FILES], dot: true })
  ).sort();
  const out: string[] = [];
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(join(root, file), "utf8");
    } catch {
      continue;
    }
    if (text.includes("\0")) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i] ?? "")) out.push(`${file}:${i + 1}:${(lines[i] ?? "").slice(0, 300)}`);
    }
  }
  return out;
}

/** rg runs files in parallel, so order its lines by file then line number. */
function sortMatches(lines: string[]): string[] {
  const key = (l: string) => {
    const m = /^(.*?):(\d+):/.exec(l);
    return [m?.[1] ?? l, Number(m?.[2] ?? 0)] as const;
  };
  return lines.sort((a, b) => {
    const [fa, la] = key(a);
    const [fb, lb] = key(b);
    return fa < fb ? -1 : fa > fb ? 1 : la - lb;
  });
}

export const grepTool = defineTool({
  name: "Grep",
  description:
    "Search file contents with a regex. Returns 'file:line:text'. Narrow with glob, e.g. '**/*.ts'.",
  permission: { kind: "path", target: (i) => i.path ?? "." },
  mutating: false,
  input: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    glob: z.string().optional(),
    ignore_case: z.boolean().optional(),
  }),
  async run({ pattern, path, glob = "**/*", ignore_case }, ctx) {
    try {
      new RegExp(pattern); // surface syntax errors identically regardless of the engine
    } catch (err) {
      throw new ToolError(`Invalid regular expression: ${(err as Error).message}`);
    }
    const search = {
      pattern,
      root: path ? resolvePath(ctx.cwd, path) : ctx.cwd,
      glob,
      ignoreCase: ignore_case,
    };
    const lines = sortMatches(
      (rgAvailable() ? await searchWithRg(search) : undefined) ?? (await searchWithJs(search)),
    );
    if (!lines.length) return "No matches.";
    const shown = lines.slice(0, MAX_MATCHES).join("\n");
    return lines.length > MAX_MATCHES
      ? `${shown}\n… ${lines.length - MAX_MATCHES} more matches`
      : shown;
  },
});
