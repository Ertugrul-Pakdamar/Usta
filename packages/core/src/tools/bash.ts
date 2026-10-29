import { spawn } from "node:child_process";
import { defineTool, z } from "@usta/sdk";

/** Memory guard for runaway commands; the output limiter shrinks what the model sees. */
const HEAD_MAX = 1_000_000;
const TAIL_MAX = 500_000;
const DEFAULT_TIMEOUT = 120_000;
const MAX_TIMEOUT = 600_000;

export const bashTool = defineTool({
  name: "Bash",
  description:
    "Run a bash command; stdout and stderr are combined. Default timeout 120s. For the same change in many files, prefer one script over many manual edits.",
  permission: { kind: "command", target: (i) => i.command },
  mutating: true,
  input: z.object({
    command: z.string(),
    timeout_ms: z.number().int().min(1).max(MAX_TIMEOUT).optional(),
  }),
  run({ command, timeout_ms = DEFAULT_TIMEOUT }, ctx) {
    return new Promise((resolve) => {
      const child = spawn("bash", ["-c", command], {
        cwd: ctx.cwd,
        detached: true, // own process group, so the whole tree can be killed
        stdio: ["ignore", "pipe", "pipe"],
      });
      let head = "";
      let tail = "";
      let dropped = 0;
      let reason = "";
      const kill = (why: string) => {
        reason = why;
        try {
          if (child.pid) process.kill(-child.pid, "SIGKILL");
        } catch {}
      };
      const timer = setTimeout(() => kill(`timed out after ${timeout_ms} ms`), timeout_ms);
      const onAbort = () => kill("cancelled");
      ctx.signal?.addEventListener("abort", onAbort, { once: true });
      const collect = (b: Buffer) => {
        const chunk = b.toString("utf8");
        if (head.length < HEAD_MAX) {
          head += chunk;
          if (head.length > HEAD_MAX) {
            tail = head.slice(HEAD_MAX);
            head = head.slice(0, HEAD_MAX);
          }
        } else {
          tail += chunk;
          if (tail.length > TAIL_MAX) {
            dropped += tail.length - TAIL_MAX;
            tail = tail.slice(-TAIL_MAX);
          }
        }
      };
      child.stdout.on("data", collect);
      child.stderr.on("data", collect);
      child.on("close", (code) => {
        clearTimeout(timer);
        ctx.signal?.removeEventListener("abort", onAbort);
        const status = reason ? `[${reason}]` : `[exit code ${code}]`;
        const output = `${head}${dropped ? `\n… [${dropped} characters dropped] …\n` : ""}${tail}`;
        resolve(`${output.trimEnd()}\n${status}`.trim());
      });
    });
  },
});
