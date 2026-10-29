import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Tool } from "@usta/sdk";
import { type AgentResult, runAgent } from "../agent/loop.js";
import { environmentLine } from "../agent/prompt.js";
import type { CheckpointStore } from "../checkpoint.js";
import type { Economy } from "../economy.js";
import {
  type AskAnswer,
  type AskRequest,
  createAfterTool,
  createReviewer,
  createToolGate,
} from "../gate.js";
import type { HookRunner } from "../hooks.js";
import type { PermissionEngine } from "../permissions.js";
import { maskSecrets } from "../session.js";
import type { Message, Provider, Usage } from "../types.js";
import { type AgentDefinition, resolveAgentTools } from "./definitions.js";

/** Everything a subagent needs from the surrounding session. */
export interface SubagentRuntime {
  provider: Provider;
  cwd: string;
  engine: PermissionEngine;
  economy: Economy;
  /** The tools that exist; each agent gets its allowlist of these. */
  tools: () => Tool<any>[];
  hooks?: HookRunner;
  checkpoints?: () => CheckpointStore | undefined;
  sessionId?: () => string | undefined;
  /** Foreground approval (already serialized by the caller). Background runs never use it. */
  ask?: (req: AskRequest) => Promise<AskAnswer>;
  onWarning?: (text: string) => void;
  /** Where subagent transcripts are written (`~/.usta/subagents/<session>`). */
  logDir?: () => string | undefined;
}

export interface SubagentResult {
  /** The agent's final report: the only thing the parent sees. */
  text: string;
  turns: number;
  usage: Usage;
  stopReason: AgentResult["stopReason"];
  stopDetail?: string;
}

export interface RunOptions {
  signal?: AbortSignal;
  /** A background run cannot ask the user: whatever needs approval is denied. */
  background: boolean;
  taskId: string;
  onProgress?: (text: string) => void;
}

const brief = (name: string, rawArgs: string) => {
  try {
    const a = JSON.parse(rawArgs || "{}") as Record<string, unknown>;
    const main = a.command ?? a.path ?? a.pattern ?? a.description;
    return `${name}${main ? `(${String(main).split("\n")[0]?.slice(0, 50)})` : ""}`;
  } catch {
    return name;
  }
};

/** Runs one subagent to completion in its own context, through the session's permission gate. */
export async function runSubagent(
  rt: SubagentRuntime,
  def: AgentDefinition,
  prompt: string,
  opts: RunOptions,
): Promise<SubagentResult> {
  const ask = opts.background ? undefined : rt.ask;
  const gate = createToolGate({
    engine: rt.engine,
    hooks: rt.hooks,
    checkpoints: rt.checkpoints,
    sessionId: rt.sessionId,
    ask,
    onWarning: rt.onWarning,
    agent: def.name,
  });
  const modelId = rt.economy.resolveModel(def.model);
  const dir = rt.logDir?.();
  if (dir) mkdirSync(dir, { recursive: true, mode: 0o700 });
  const log = (m: Message) => {
    if (dir)
      appendFileSync(join(dir, `${opts.taskId}.jsonl`), `${maskSecrets(JSON.stringify(m))}\n`, {
        mode: 0o600,
      });
  };

  const result = await runAgent(prompt, {
    provider: rt.provider,
    model: modelId,
    tools: resolveAgentTools(def, rt.tools()),
    cwd: rt.cwd,
    system: `${def.prompt}\n\n${environmentLine(rt.cwd)}`,
    maxTurns: def.maxTurns,
    signal: opts.signal,
    approve: gate,
    review: createReviewer({
      engine: rt.engine,
      ask,
      checkpoints: rt.checkpoints,
      agent: def.name,
    }),
    afterTool: rt.hooks ? createAfterTool(rt.hooks, rt.sessionId, rt.onWarning) : undefined,
    beforeRequest: rt.economy.subagentGuard,
    limitOutput: rt.economy.limitOutput,
    state: new Map(),
    onMessage: log,
    onEvent: (ev) => {
      if (ev.type === "usage") rt.economy.trackSubagentUsage(ev.usage, modelId);
      if (ev.type === "tool_start") opts.onProgress?.(brief(ev.call.name, ev.call.arguments));
    },
  });
  log({ role: "user", content: `[final] ${result.stopReason}` });
  const text =
    result.text.trim() ||
    (result.stopReason === "max_turns"
      ? "(the subagent reached its turn limit without writing a final report)"
      : "(the subagent produced no report)");
  return {
    text,
    turns: result.turns,
    usage: result.usage,
    stopReason: result.stopReason,
    stopDetail: result.stopDetail,
  };
}
