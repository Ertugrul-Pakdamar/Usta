import { dirname } from "node:path";
import type { ReviewRequest, ReviewVerdict, Tool } from "@usta/sdk";
import type { AfterToolFn, ApprovalVerdict } from "./agent/loop.js";
import type { CheckpointStore } from "./checkpoint.js";
import type { HookRunner } from "./hooks.js";
import { type PermissionEngine, type PermissionMode, resolveTarget } from "./permissions.js";
import type { ToolCall } from "./types.js";

export interface AskRequest {
  /** "review" = a tool asks to apply a batch of changes it prepared (diff shown). */
  kind: "tool" | "plan" | "review";
  tool: Tool<any>;
  input: unknown;
  call: ToolCall;
  reason?: string;
  /** Unified diff of what the call would change. */
  diff?: string;
  /** Markdown plan (kind "plan"). */
  plan?: string;
  /** What answering "remember" would do, for the prompt label. */
  rememberLabel?: string;
}

export interface AskAnswer {
  allow: boolean;
  remember?: boolean;
  /** For plan approval: the mode to continue in. */
  mode?: PermissionMode;
}

export interface GateOptions {
  engine: PermissionEngine;
  hooks?: HookRunner;
  checkpoints?: () => CheckpointStore | undefined;
  sessionId?: () => string | undefined;
  /** Without it, anything that needs approval is denied (non-interactive runs). */
  ask?: (req: AskRequest) => Promise<AskAnswer>;
  onWarning?: (text: string) => void;
  /** Receives the diff computed for each mutating call (to show with the result). */
  onPreview?: (callId: string, diff: string) => void;
}

/** What "always allow" means for this call, and how to apply it. */
function remember(tool: Tool<any>, input: unknown, engine: PermissionEngine) {
  const target = tool.permission?.target(input as never);
  if (tool.permission?.kind === "command" && target) {
    return {
      label: `bu komutu bu oturumda hep (${target.slice(0, 40)})`,
      apply: () => engine.addRule("allow", `${tool.name}(${target})`),
    };
  }
  if (tool.permission?.kind === "path" && target) {
    const { insideCwd, candidates } = resolveTarget(target, engine.cwd);
    if (tool.mutating && insideCwd) {
      return {
        label: "çalışma dizinindeki düzenlemeleri otomatik kabul et",
        apply: () => engine.setMode("acceptEdits"),
      };
    }
    const dir = dirname(candidates[0] as string);
    return {
      label: `${dir}/** için bu oturumda hep`,
      apply: () => engine.addRule("allow", `${tool.name}(${dir}/**)`),
    };
  }
  return {
    label: `${tool.name} için bu oturumda hep`,
    apply: () => engine.addRule("allow", tool.name),
  };
}

/**
 * The single place every tool call passes before it runs:
 * permission rules → PreToolUse hooks → user prompt (if needed) → checkpoint.
 * Hooks can only make things stricter; they cannot override a deny or ask.
 */
export function createToolGate(opts: GateOptions) {
  const { engine } = opts;
  return async (tool: Tool<any>, input: unknown, call: ToolCall): Promise<ApprovalVerdict> => {
    const verdict = engine.decide(tool, input);
    if (verdict.decision === "deny") return { allow: false, reason: verdict.reason };

    if (opts.hooks?.has("PreToolUse")) {
      const hook = await opts.hooks.run("PreToolUse", {
        sessionId: opts.sessionId?.(),
        toolName: tool.name,
        toolInput: input,
      });
      for (const w of hook.warnings) opts.onWarning?.(w);
      if (hook.blocked) return { allow: false, reason: `Hook engelledi: ${hook.blocked.reason}` };
    }

    const diff = tool.mutating
      ? await tool.preview?.(input as never, { cwd: engine.cwd }).catch(() => undefined)
      : undefined;
    // Previews of commands (Script source) are for the approval box only, not for the result line.
    if (diff && tool.permission?.kind === "path") opts.onPreview?.(call.id, diff);

    if (verdict.decision === "ask") {
      if (!opts.ask) {
        return {
          allow: false,
          reason:
            "onay gerekiyor ama etkileşimli onay yok (--allow kuralı veya --permission-mode ile izin verilebilir)",
        };
      }
      const isPlan = tool.name === "ExitPlanMode";
      const mem = remember(tool, input, engine);
      const answer = await opts.ask({
        kind: isPlan ? "plan" : "tool",
        tool,
        input,
        call,
        reason: verdict.reason,
        diff,
        plan: isPlan ? String((input as { plan?: string }).plan ?? "") : undefined,
        rememberLabel: mem.label,
      });
      if (!answer.allow) {
        return {
          allow: false,
          reason: isPlan ? "kullanıcı planı onaylamadı; planı revize edin" : "kullanıcı reddetti",
        };
      }
      if (answer.mode) engine.setMode(answer.mode);
      else if (answer.remember) mem.apply();
    }

    if (tool.mutating && tool.permission?.kind === "path") {
      const target = tool.permission.target(input as never);
      const store = opts.checkpoints?.();
      if (target && store) store.record(resolveTarget(target, engine.cwd).candidates[0] as string);
    }
    return true;
  };
}

/**
 * Answers `ctx.review` for tools that prepare many file changes on their own (Script):
 * deny rules and protected paths are checked per file, the user sees the diff when
 * approval is needed, and every file is checkpointed before the tool writes it.
 */
export function createReviewer(opts: Pick<GateOptions, "engine" | "ask" | "checkpoints">) {
  return async (tool: Tool<any>, call: ToolCall, req: ReviewRequest): Promise<ReviewVerdict> => {
    const verdict = opts.engine.decideWrites(req.paths, tool.name);
    if (verdict.decision === "deny") return { ok: false, reason: verdict.reason };
    if (verdict.decision === "ask") {
      if (!opts.ask)
        return {
          ok: false,
          reason: "approval is needed but nobody can be asked (run interactively or allow edits)",
        };
      const answer = await opts.ask({
        kind: "review",
        tool,
        input: undefined,
        call,
        reason: verdict.reason ?? req.summary,
        diff: req.diff,
      });
      if (!answer.allow) return { ok: false, reason: "the user declined" };
    }
    const store = opts.checkpoints?.();
    if (store) for (const p of req.paths) store.record(p);
    return { ok: true };
  };
}

/** PostToolUse hooks as a loop `afterTool` callback. */
export function createAfterTool(
  hooks: HookRunner,
  sessionId?: () => string | undefined,
  onWarning?: (t: string) => void,
) {
  return async (
    tool: Tool<any>,
    input: unknown,
    _call: ToolCall,
    result: { output: string; isError: boolean },
  ): Promise<string | undefined> => {
    if (!hooks.has("PostToolUse")) return undefined;
    const r = await hooks.run("PostToolUse", {
      sessionId: sessionId?.(),
      toolName: tool.name,
      toolInput: input,
      toolOutput: result.output.slice(0, 5000),
      isError: result.isError,
    });
    for (const w of r.warnings) onWarning?.(w);
    const lines = [
      ...(r.blocked ? [`[PostToolUse hook] ${r.blocked.reason}`] : []),
      ...r.context.map((c) => `[PostToolUse hook] ${c}`),
    ];
    return lines.length ? lines.join("\n") : undefined;
  };
}

/** Runs several afterTool callbacks and joins whatever each one wants to append. */
export function composeAfterTool(...fns: (AfterToolFn | undefined)[]): AfterToolFn {
  return async (tool, input, call, result) => {
    const extras: string[] = [];
    for (const fn of fns) {
      const extra = await fn?.(tool, input, call, result);
      if (extra) extras.push(extra);
    }
    return extras.length ? extras.join("\n") : undefined;
  };
}
