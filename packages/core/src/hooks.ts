import { spawn } from "node:child_process";
import { t } from "./i18n/index.js";

export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "SessionStart",
  "Stop",
] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookDef {
  /** Regex tested against the tool name (tool events only). Empty or "*" = all. */
  matcher?: string;
  command: string;
  /** Seconds. Default 30. */
  timeout?: number;
}

export type HookConfig = Partial<Record<HookEvent, HookDef[]>>;

export interface HookPayload {
  sessionId?: string;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: string;
  isError?: boolean;
  prompt?: string;
}

export interface HookResult {
  blocked?: { reason: string };
  /** Text hooks want the model to see (stdout of UserPromptSubmit/SessionStart, or `context`). */
  context: string[];
  warnings: string[];
}

const MAX_OUTPUT = 10_000;

function matches(def: HookDef, toolName: string | undefined): boolean {
  if (toolName === undefined || !def.matcher || def.matcher === "*") return true;
  try {
    return new RegExp(`^(?:${def.matcher})$`).test(toolName);
  } catch {
    return false;
  }
}

function exec(def: HookDef, cwd: string, stdin: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>(
    (resolve) => {
      const child = spawn("bash", ["-c", def.command], {
        cwd,
        detached: true,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, USTA_PROJECT_DIR: cwd },
      });
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          try {
            if (child.pid) process.kill(-child.pid, "SIGKILL");
          } catch {}
        },
        (def.timeout ?? 30) * 1000,
      );
      child.stdout.on("data", (b: Buffer) => {
        stdout = (stdout + b.toString("utf8")).slice(0, MAX_OUTPUT);
      });
      child.stderr.on("data", (b: Buffer) => {
        stderr = (stderr + b.toString("utf8")).slice(0, MAX_OUTPUT);
      });
      child.on("error", () => resolve({ code: null, stdout, stderr: "failed to start", timedOut }));
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
      child.stdin.on("error", () => {}); // hook may exit without reading stdin
      child.stdin.end(stdin);
    },
  );
}

/**
 * Runs user-configured shell commands at lifecycle points. The event is passed as JSON
 * on stdin. Exit 0 = ok (stdout may be `{"decision":"block","reason":…}` or `{"context":…}`),
 * exit 2 = block (stderr is the reason), anything else = a warning only.
 */
export class HookRunner {
  constructor(
    private readonly config: HookConfig,
    private readonly cwd: string,
  ) {}

  has(event: HookEvent): boolean {
    return (this.config[event]?.length ?? 0) > 0;
  }

  async run(event: HookEvent, payload: HookPayload = {}): Promise<HookResult> {
    const result: HookResult = { context: [], warnings: [] };
    const stdin = JSON.stringify({ event, cwd: this.cwd, ...payload });
    for (const def of this.config[event] ?? []) {
      if (!matches(def, payload.toolName)) continue;
      const r = await exec(def, this.cwd, stdin);
      if (r.timedOut) {
        result.warnings.push(
          t("hooks.timeout", { seconds: def.timeout ?? 30, command: def.command }),
        );
        continue;
      }
      if (r.code === 2) {
        result.blocked = { reason: (r.stderr || r.stdout).trim() || "the hook blocked the call" };
        return result;
      }
      if (r.code !== 0) {
        result.warnings.push(
          t("hooks.failed", {
            code: r.code ?? "?",
            command: def.command,
            detail: r.stderr ? ` — ${r.stderr.trim()}` : "",
          }),
        );
        continue;
      }
      const out = r.stdout.trim();
      if (!out) continue;
      try {
        const json = JSON.parse(out) as { decision?: string; reason?: string; context?: string };
        if (json.decision === "block") {
          result.blocked = { reason: json.reason || "the hook blocked the call" };
          return result;
        }
        if (typeof json.context === "string") result.context.push(json.context);
      } catch {
        if (event === "UserPromptSubmit" || event === "SessionStart") result.context.push(out);
      }
    }
    return result;
  }
}
