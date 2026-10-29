import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { t } from "./i18n/index.js";

export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "UserPromptSubmit",
  "SessionStart",
  "Stop",
  "SubagentStop",
] as const;
export type HookEvent = (typeof HOOK_EVENTS)[number];

export interface HookDef {
  /** Regex tested against the tool name (tool events only). Empty or "*" = all. */
  matcher?: string;
  /** Shell command; the event arrives as JSON on stdin. Exactly one of `command` / `module`. */
  command?: string;
  /**
   * JavaScript module (relative to the working directory, or absolute) whose default export is
   * `(event) => void | {decision?: "block", reason?, context?}`. Runs in-process, so it has
   * the same power as a command hook; it comes from user settings or an installed plugin.
   */
  module?: string;
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
  /** SubagentStop: which agent ran, what it was asked to do, and its final report. */
  agent?: string;
  description?: string;
  result?: string;
  /** Stop: true when the agent is already continuing because of an earlier Stop hook. */
  stopHookActive?: boolean;
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

const hookLabel = (def: HookDef) => def.command ?? def.module ?? "?";

/** Runs a module hook with a timeout; whatever it returns is handled like a command's JSON. */
async function execModule(
  def: HookDef,
  cwd: string,
  event: unknown,
): Promise<{ value?: unknown; error?: string; timedOut: boolean }> {
  const file = isAbsolute(def.module as string)
    ? (def.module as string)
    : resolve(cwd, def.module as string);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const mod = (await import(pathToFileURL(file).href)) as { default?: unknown };
    if (typeof mod.default !== "function")
      return { error: "no default export function", timedOut: false };
    const timeout = new Promise<"timeout">((r) => {
      timer = setTimeout(() => r("timeout"), (def.timeout ?? 30) * 1000);
    });
    const out = await Promise.race([
      Promise.resolve((mod.default as (e: unknown) => unknown)(event)),
      timeout,
    ]);
    return out === "timeout" ? { timedOut: true } : { value: out, timedOut: false };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), timedOut: false };
  } finally {
    clearTimeout(timer);
  }
}

function exec(def: HookDef, cwd: string, stdin: string) {
  return new Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }>(
    (resolve) => {
      const child = spawn("bash", ["-c", def.command as string], {
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
    const full = { event, cwd: this.cwd, ...payload };
    const stdin = JSON.stringify(full);
    for (const def of this.config[event] ?? []) {
      if (!matches(def, payload.toolName)) continue;
      if (def.module) {
        const m = await execModule(def, this.cwd, full);
        if (m.timedOut) {
          result.warnings.push(
            t("hooks.timeout", { seconds: def.timeout ?? 30, command: hookLabel(def) }),
          );
        } else if (m.error) {
          result.warnings.push(
            t("hooks.failed", { code: "!", command: hookLabel(def), detail: ` — ${m.error}` }),
          );
        } else {
          const v = m.value as { decision?: string; reason?: string; context?: string } | undefined;
          if (v?.decision === "block") {
            result.blocked = { reason: v.reason || "the hook blocked the call" };
            return result;
          }
          if (typeof v?.context === "string") result.context.push(v.context);
        }
        continue;
      }
      const r = await exec(def, this.cwd, stdin);
      if (r.timedOut) {
        result.warnings.push(
          t("hooks.timeout", { seconds: def.timeout ?? 30, command: hookLabel(def) }),
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
            command: hookLabel(def),
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
