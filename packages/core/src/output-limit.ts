import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Tool } from "@usta/sdk";
import type { ToolCall } from "./types.js";

export interface LimiterOptions {
  /** Where full outputs are saved. Undefined = just truncate. */
  dir: () => string | undefined;
  /** Max characters of one tool output that enters the conversation. */
  maxChars?: number;
  /** Per-tool override (Read caps itself and must not point back at a file). */
  perTool?: Record<string, number>;
}

const DEFAULT_MAX = 12_000;
const HEAD_SHARE = 0.6;

/**
 * Keeps big tool outputs from flooding the context: the model sees the head and tail plus
 * a pointer to the complete output on disk, which it can open with Read (offset/limit).
 */
export function createOutputLimiter(opts: LimiterOptions) {
  return (tool: Tool<any>, call: ToolCall, output: string): string => {
    const max = opts.perTool?.[tool.name] ?? opts.maxChars ?? DEFAULT_MAX;
    if (output.length <= max) return output;
    const head = output.slice(0, Math.floor(max * HEAD_SHARE));
    const tail = output.slice(-Math.floor(max * (1 - HEAD_SHARE)));
    const omitted = output.length - head.length - tail.length;

    const dir = tool.name === "Read" ? undefined : opts.dir();
    let pointer = tool.name === "Read" ? "Re-read with a smaller limit or a different offset." : "";
    if (dir) {
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        const file = join(dir, `${call.id.replace(/[^\w-]/g, "_")}.txt`);
        writeFileSync(file, output, { mode: 0o600 });
        pointer = `Full output saved to ${file}; open it with Read (offset/limit) if you need more.`;
      } catch {}
    }
    return `${head}\n… [${omitted} characters omitted. ${pointer}] …\n${tail}`;
  };
}

/** Saved tool outputs are scratch data: remove sessions' folders not touched for `days`. */
export function pruneOldOutputs(home = homedir(), days = 7, now = Date.now()): void {
  const root = join(home, ".usta", "outputs");
  try {
    for (const name of readdirSync(root)) {
      const dir = join(root, name);
      if (now - statSync(dir).mtimeMs > days * 86_400_000)
        rmSync(dir, { recursive: true, force: true });
    }
  } catch {} // nothing saved yet, or a race with another process: both fine
}
