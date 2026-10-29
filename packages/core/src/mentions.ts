import { readFileSync, realpathSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import fg from "fast-glob";
import { IGNORE } from "./tools/glob.js";

const MAX_FILES = 20_000;
const MAX_INLINE_CHARS = 12_000;
const MAX_MENTIONS = 5;
const SECRET = /^\.env(\..*)?$|\.(pem|key|p12|pfx)$/;
const isSecret = (path: string) => SECRET.test(basename(path)) && basename(path) !== ".env.example";

/** Project files for `@` completion (relative paths, no dependencies/VCS data/secrets). */
export async function listProjectFiles(cwd: string): Promise<string[]> {
  const files = await fg("**/*", { cwd, ignore: IGNORE, dot: true, onlyFiles: true });
  return files
    .filter((f) => !isSecret(f))
    .sort()
    .slice(0, MAX_FILES);
}

/** Best matches first: path prefix, then file-name prefix, then substring (case-insensitive). */
export function rankFiles(files: readonly string[], query: string, limit = 5): string[] {
  const q = query.toLowerCase();
  if (!q) return files.slice(0, limit);
  const rank = (f: string) => {
    const lower = f.toLowerCase();
    if (lower.startsWith(q)) return 0;
    if (basename(lower).startsWith(q)) return 1;
    return lower.includes(q) ? 2 : 3;
  };
  return files
    .map((f) => [f, rank(f)] as const)
    .filter(([, r]) => r < 3)
    .sort((a, b) => a[1] - b[1] || a[0].length - b[0].length || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([f]) => f);
}

export interface MentionResult {
  /** The text to send: the original plus an `<attached-file>` block per mentioned file. */
  text: string;
  /** What was attached, for a one-line notice to the user. */
  attached: { path: string; lines: number; truncated: boolean }[];
}

/**
 * Turns `@path` mentions into attached file contents so the model need not spend a `Read`
 * call. Only existing regular files inside the working directory are attached (secrets never;
 * `@` inside words, e-mail addresses or unknown paths stay plain text). Big files are cut with
 * a note telling the model to use `Read` for the rest.
 */
export function expandMentions(text: string, cwd: string): MentionResult {
  const attached: MentionResult["attached"] = [];
  const blocks: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(/(?<=^|\s)@([^\s@]+)/g)) {
    if (attached.length >= MAX_MENTIONS) break;
    const rel = (m[1] as string).replace(/[.,;:!?)]+$/, "");
    const abs = resolve(cwd, rel);
    const inside = relative(cwd, abs);
    if (!inside || inside.startsWith("..") || inside.split(sep).includes("..")) continue;
    if (seen.has(abs) || isSecret(abs)) continue;
    try {
      // Follow symlinks first: a harmless-looking link must not lead to a secret or out of the project.
      const real = realpathSync(abs);
      const realInside = relative(realpathSync(cwd), real);
      if (!realInside || realInside.startsWith("..") || isSecret(real)) continue;
      if (!statSync(real).isFile()) continue;
      const content = readFileSync(real, "utf8");
      if (content.includes("\0")) continue; // binary
      seen.add(abs);
      const truncated = content.length > MAX_INLINE_CHARS;
      const shown = truncated ? content.slice(0, MAX_INLINE_CHARS) : content;
      const lines = content.split("\n").length;
      attached.push({ path: inside, lines, truncated });
      blocks.push(
        `<attached-file path="${inside}"${truncated ? ` truncated="true" total-lines="${lines}"` : ""}>\n${shown}\n</attached-file>`,
      );
    } catch {} // missing or unreadable: leave the mention as text
  }
  return { text: blocks.length ? `${text}\n\n${blocks.join("\n")}` : text, attached };
}
