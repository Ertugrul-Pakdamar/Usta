import type { UstaConfig } from "./config.js";
import type { Message, ToolSpec } from "./types.js";

/** Per-message framing the chat template adds (role markers etc.). */
const MESSAGE_OVERHEAD = 4;

export function messageChars(m: Message): number {
  let n = m.content.length;
  if (m.role === "assistant") {
    for (const c of m.toolCalls ?? []) n += c.name.length + c.arguments.length + 20;
  }
  return n;
}

/**
 * Offline token estimate. The chars-per-token ratio starts as a guess and is calibrated
 * from every real `usage` the gateway returns, so it adapts to language and content.
 */
export class TokenEstimator {
  constructor(private charsPerToken = 3.2) {}

  get ratio(): number {
    return this.charsPerToken;
  }

  text(text: string): number {
    return Math.ceil(text.length / this.charsPerToken);
  }

  messages(messages: readonly Message[]): number {
    return messages.reduce(
      (sum, m) => sum + Math.ceil(messageChars(m) / this.charsPerToken) + MESSAGE_OVERHEAD,
      0,
    );
  }

  tools(tools: readonly ToolSpec[]): number {
    return this.text(JSON.stringify(tools));
  }

  /** Feeds back a measurement: `chars` of request text turned out to be `tokens` tokens. */
  calibrate(chars: number, tokens: number): void {
    if (tokens < 50 || chars < 100) return; // too small to say anything
    const observed = Math.min(6, Math.max(1.5, chars / tokens));
    this.charsPerToken = this.charsPerToken * 0.7 + observed * 0.3;
  }
}

// --- Exact counting through the gateway ---------------------------------------------

type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

export interface CountRequest {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolSpec[];
}

/** Converts our messages to the Anthropic shape `count_tokens` expects. */
export function toCountPayload(req: CountRequest) {
  const out: { role: "user" | "assistant"; content: string | Block[] }[] = [];
  const system = [
    req.system,
    ...req.messages.filter((m) => m.role === "system").map((m) => m.content),
  ]
    .filter(Boolean)
    .join("\n\n");
  for (const m of req.messages) {
    if (m.role === "system") continue;
    if (m.role === "tool") {
      const block: Block = {
        type: "tool_result",
        tool_use_id: m.toolCallId,
        content: m.content || "(empty)",
      };
      const last = out.at(-1);
      if (
        last &&
        last.role === "user" &&
        Array.isArray(last.content) &&
        last.content[0]?.type === "tool_result"
      ) {
        last.content.push(block); // consecutive tool results share one user turn
      } else out.push({ role: "user", content: [block] });
    } else if (m.role === "assistant") {
      const blocks: Block[] = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const c of m.toolCalls ?? []) {
        let input: unknown = {};
        try {
          input = JSON.parse(c.arguments || "{}");
        } catch {}
        blocks.push({ type: "tool_use", id: c.id, name: c.name, input });
      }
      out.push({ role: "assistant", content: blocks.length ? blocks : "(empty)" });
    } else {
      out.push({ role: "user", content: m.content || "(empty)" });
    }
  }
  return {
    model: req.model,
    ...(system && { system }),
    messages: out,
    ...(req.tools?.length && {
      tools: req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
    }),
  };
}

/** Exact input-token count from `POST /v1/messages/count_tokens` (system and tools included). */
export class GatewayTokenCounter {
  constructor(
    private readonly config: Pick<UstaConfig, "apiKey" | "baseUrl">,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  /** Returns undefined when the gateway cannot count (offline, unsupported). */
  async count(req: CountRequest): Promise<number | undefined> {
    try {
      const res = await this.fetchImpl(`${this.config.baseUrl}/messages/count_tokens`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toCountPayload(req)),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return undefined;
      const body = (await res.json()) as { input_tokens?: number };
      return typeof body.input_tokens === "number" ? body.input_tokens : undefined;
    } catch {
      return undefined;
    }
  }
}
