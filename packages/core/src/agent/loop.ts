import { type ReviewRequest, type ReviewVerdict, type Tool, ToolError, z } from "@usta/sdk";
import { BudgetExceededError } from "../cost.js";
import { extractTextToolCalls } from "../provider/text-tool-calls.js";
import type { Message, Provider, ToolCall, ToolSpec, Usage } from "../types.js";
import { buildSystemPrompt } from "./prompt.js";

export type AgentEvent =
  | { type: "text"; delta: string }
  /** `sentMessages` = length of the history (system included) the request was built from, excluding the volatile tail. */
  | { type: "usage"; usage: Usage; sentMessages: number }
  | { type: "tool_start"; call: ToolCall }
  | { type: "tool_result"; call: ToolCall; output: string; isError: boolean };

/** `false`/`{allow:false}` blocks the call; `reason` is shown to the model. */
export type ApprovalVerdict = boolean | { allow: boolean; reason?: string };

export type AfterToolFn = (
  tool: Tool<any>,
  input: unknown,
  call: ToolCall,
  result: { output: string; isError: boolean },
) => Promise<string | undefined>;

export interface AgentOptions {
  provider: Provider;
  model: string;
  /** A function is re-evaluated every turn (e.g. ExitPlanMode only exists in plan mode). */
  tools: Tool<any>[] | (() => Tool<any>[]);
  cwd: string;
  /** A function is re-evaluated every turn (e.g. when the permission mode changes). */
  system?: string | (() => string);
  maxTokens?: number;
  maxTurns?: number;
  signal?: AbortSignal;
  /**
   * Asked before EVERY tool call. Omitted = read-only tools run, mutating ones are denied.
   */
  approve?: (tool: Tool<any>, input: unknown, call: ToolCall) => Promise<ApprovalVerdict>;
  /** Extra text appended to a tool's result (e.g. PostToolUse hook feedback). */
  afterTool?: AfterToolFn;
  /**
   * Runs before every model request. May return a replacement message list (compaction);
   * throwing `BudgetExceededError` stops the run with `stopReason: "budget"`.
   */
  beforeRequest?: (info: {
    messages: Message[];
    tools: ToolSpec[];
    turn: number;
  }) => Promise<{ messages: Message[] } | undefined>;
  /**
   * Text appended as a last user message to each request but never stored in the history.
   * Keeps the stable prefix cacheable while still telling the model about volatile state.
   */
  volatileTail?: () => string | undefined;
  /** Shrinks a tool's output before it enters the conversation. */
  limitOutput?: (tool: Tool<any>, call: ToolCall, output: string) => string | Promise<string>;
  /** Answers a tool's `ctx.review` request (diff approval for batch writes). */
  review?: (tool: Tool<any>, call: ToolCall, req: ReviewRequest) => Promise<ReviewVerdict>;
  /** Shared scratch space handed to tools as `ctx.state`. */
  state?: Map<string, unknown>;
  onEvent?: (event: AgentEvent) => void;
  /** Called for every assistant/tool message the run produces (e.g. to persist it). */
  onMessage?: (message: Message) => void;
}

export interface AgentResult {
  messages: Message[];
  text: string;
  turns: number;
  usage: Usage;
  stopReason: "end_turn" | "max_turns" | "aborted" | "budget";
  /** Why the run stopped, when it is not a normal end. */
  stopDetail?: string;
}

/**
 * Drops schema noise that only costs tokens: we validate arguments ourselves with zod, so
 * `additionalProperties: false` and the "safe integer" bounds zod adds are not needed.
 */
function slim(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(slim);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === "additionalProperties" && value === false) continue;
      if (key === "maximum" && value === Number.MAX_SAFE_INTEGER) continue;
      if (key === "minimum" && value === Number.MIN_SAFE_INTEGER) continue;
      out[key] = slim(value);
    }
    return out;
  }
  return node;
}

export function toToolSpec(tool: Tool): ToolSpec {
  const { $schema: _, ...parameters } = z.toJSONSchema(tool.input) as Record<string, unknown>;
  return {
    name: tool.name,
    description: tool.description,
    parameters: slim(parameters) as Record<string, unknown>,
  };
}

const specCache = new WeakMap<Tool, ToolSpec>();
const specOf = (tool: Tool) => {
  let spec = specCache.get(tool);
  if (!spec) specCache.set(tool, (spec = toToolSpec(tool)));
  return spec;
};

async function execute(
  call: ToolCall,
  tools: Tool<any>[],
  opts: AgentOptions,
): Promise<{ output: string; isError: boolean }> {
  const tool = tools.find((t) => t.name === call.name);
  if (!tool) {
    const known = tools.map((t) => t.name).join(", ");
    return { output: `Bilinmeyen tool: ${call.name}. Mevcut tool'lar: ${known}`, isError: true };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(call.arguments || "{}");
  } catch {
    return { output: "Argümanlar geçerli JSON değil; düzeltip tekrar çağırın.", isError: true };
  }
  const parsed = tool.input.safeParse(raw);
  if (!parsed.success) {
    return { output: `Geçersiz argümanlar: ${z.prettifyError(parsed.error)}`, isError: true };
  }
  const verdict = opts.approve ? await opts.approve(tool, parsed.data, call) : !tool.mutating;
  const allowed = typeof verdict === "boolean" ? verdict : verdict.allow;
  if (!allowed) {
    const reason = typeof verdict === "object" ? verdict.reason : undefined;
    return {
      output: `${tool.name} çağrısına izin verilmedi${reason ? `: ${reason}` : "."} Aynı çağrıyı tekrar denemeyin; kullanıcıya neye ihtiyacınız olduğunu söyleyin.`,
      isError: true,
    };
  }
  let result: { output: string; isError: boolean };
  try {
    result = {
      output: await tool.run(parsed.data, {
        cwd: opts.cwd,
        signal: opts.signal,
        state: opts.state,
        review: opts.review
          ? (req) => (opts.review as NonNullable<typeof opts.review>)(tool, call, req)
          : undefined,
      }),
      isError: false,
    };
  } catch (err) {
    result =
      err instanceof ToolError
        ? { output: err.message, isError: true }
        : { output: `Beklenmeyen hata: ${(err as Error).message}`, isError: true };
  }
  if (opts.limitOutput) result.output = await opts.limitOutput(tool, call, result.output);
  const extra = await opts.afterTool?.(tool, parsed.data, call, result);
  return extra ? { ...result, output: `${result.output}\n\n${extra}` } : result;
}

export async function runAgent(
  prompt: string | Message[],
  opts: AgentOptions,
): Promise<AgentResult> {
  const systemOf = () =>
    typeof opts.system === "function"
      ? opts.system()
      : (opts.system ?? buildSystemPrompt(opts.cwd));
  const history: Message[] =
    typeof prompt === "string" ? [{ role: "user", content: prompt }] : prompt;
  const messages: Message[] =
    history[0]?.role === "system"
      ? [...history]
      : [{ role: "system", content: systemOf() }, ...history];
  const push = (m: Message) => {
    messages.push(m);
    opts.onMessage?.(m);
  };
  const toolsOf = () => (typeof opts.tools === "function" ? opts.tools() : opts.tools);
  const usage: Usage = { promptTokens: 0, completionTokens: 0 };
  const maxTurns = opts.maxTurns ?? 25;
  let text = "";

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (opts.signal?.aborted)
      return { messages, text, turns: turn - 1, usage, stopReason: "aborted" };

    if (history[0]?.role !== "system") messages[0] = { role: "system", content: systemOf() };
    const tools = toolsOf();
    const specs = tools.map(specOf);
    try {
      const replaced = await opts.beforeRequest?.({ messages, tools: specs, turn });
      if (replaced) messages.splice(0, messages.length, ...replaced.messages);
    } catch (err) {
      if (err instanceof BudgetExceededError) {
        return {
          messages,
          text,
          turns: turn - 1,
          usage,
          stopReason: "budget",
          stopDetail: err.message,
        };
      }
      throw err;
    }
    const tail = opts.volatileTail?.();
    const requestMessages: Message[] = tail
      ? [...messages, { role: "user", content: tail }]
      : messages;
    let content = "";
    let toolCalls: ToolCall[] = [];
    try {
      for await (const ev of opts.provider.stream({
        model: opts.model,
        messages: requestMessages,
        tools: specs,
        maxTokens: opts.maxTokens,
        signal: opts.signal,
      })) {
        if (ev.type === "text") {
          content += ev.delta;
          opts.onEvent?.({ type: "text", delta: ev.delta });
        } else {
          toolCalls = ev.toolCalls;
          if (ev.usage) {
            usage.promptTokens += ev.usage.promptTokens;
            usage.completionTokens += ev.usage.completionTokens;
            usage.cachedTokens = (usage.cachedTokens ?? 0) + (ev.usage.cachedTokens ?? 0);
            opts.onEvent?.({
              type: "usage",
              usage: ev.usage,
              sentMessages: requestMessages.length,
            });
          }
        }
      }
    } catch (err) {
      // A cancelled stream is not an error; the partial reply is dropped so history stays valid.
      if (opts.signal?.aborted)
        return { messages, text, turns: turn - 1, usage, stopReason: "aborted" };
      throw err;
    }
    if (!toolCalls.length) {
      const fallback = extractTextToolCalls(content);
      content = fallback.text;
      toolCalls = fallback.toolCalls;
    }

    push({ role: "assistant", content, ...(toolCalls.length && { toolCalls }) });
    text = content;
    if (!toolCalls.length) return { messages, text, turns: turn, usage, stopReason: "end_turn" };

    const run = async (call: ToolCall) => {
      opts.onEvent?.({ type: "tool_start", call });
      const result = await execute(call, tools, opts);
      opts.onEvent?.({ type: "tool_result", call, ...result });
      return result;
    };
    // Read-only calls run in parallel; anything mutating runs one at a time, in order.
    const allReadOnly = toolCalls.every((c) => !tools.find((t) => t.name === c.name)?.mutating);
    const results = allReadOnly
      ? await Promise.all(toolCalls.map(run))
      : await toolCalls.reduce<Promise<Awaited<ReturnType<typeof run>>[]>>(
          async (acc, call) => [...(await acc), await run(call)],
          Promise.resolve([]),
        );
    toolCalls.forEach((call, i) => {
      push({ role: "tool", toolCallId: call.id, content: results[i]?.output ?? "" });
    });
  }
  return { messages, text, turns: maxTurns, usage, stopReason: "max_turns" };
}
