import { readFile, stat } from "node:fs/promises";
import { defineTool, ToolError, z } from "@usta/sdk";
import { resolvePath } from "./paths.js";

const MAX_LINES = 2000;
const MAX_LINE_CHARS = 2000;
/** Keeps one Read well below the output limiter, so a Read is never silently cut. */
const MAX_CHARS = 28_000;

/** Forgets which files were already read (their content left the conversation). */
export function clearReadCache(state: Map<string, unknown> | undefined): void {
  for (const key of [...(state?.keys() ?? [])]) if (key.startsWith("read:")) state?.delete(key);
}

export const readTool = defineTool({
  name: "Read",
  description:
    "Read a file with line numbers. Use offset (1-based line) and limit for large files.",
  permission: { kind: "path", target: (i) => i.path },
  mutating: false,
  input: z.object({
    path: z.string(),
    offset: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).optional(),
  }),
  async run({ path, offset = 1, limit = MAX_LINES }, ctx) {
    const abs = resolvePath(ctx.cwd, path);
    let info: Awaited<ReturnType<typeof stat>>;
    try {
      info = await stat(abs);
    } catch (err) {
      throw new ToolError(`Dosya okunamadı (${path}): ${(err as NodeJS.ErrnoException).code}`);
    }
    // Re-reading an unchanged range only repeats tokens already in the conversation.
    const key = `read:${abs}:${offset}:${limit}`;
    const stamp = `${info.mtimeMs}:${info.size}`;
    if (ctx.state?.get(key) === stamp) {
      return "[Unchanged since your previous Read of this range; its content is still in the conversation above.]";
    }

    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch (err) {
      throw new ToolError(`Dosya okunamadı (${path}): ${(err as NodeJS.ErrnoException).code}`);
    }
    if (text.includes("\0")) throw new ToolError(`${path} ikili (binary) bir dosya.`);

    const lines = text.split("\n");
    const last = Math.min(lines.length, offset - 1 + Math.min(limit, MAX_LINES));
    const out: string[] = [];
    let chars = 0;
    let end = offset - 1;
    for (; end < last; end++) {
      const row = `${String(end + 1).padStart(6)}\t${(lines[end] ?? "").slice(0, MAX_LINE_CHARS)}`;
      if (chars + row.length > MAX_CHARS && out.length > 0) break;
      out.push(row);
      chars += row.length + 1;
    }
    const more =
      end < lines.length ? `\n… ${lines.length - end} more lines (offset=${end + 1})` : "";
    ctx.state?.set(key, stamp);
    return (out.join("\n") || "(empty file or offset past end)") + more;
  },
});
