import OpenAI from "openai";
import type { UstaConfig } from "../config.js";
import { gatewayError } from "../errors.js";
import type { ChatRequest, Message, Provider, ProviderEvent, ToolCall, Usage } from "../types.js";

function toWire(m: Message): OpenAI.Chat.ChatCompletionMessageParam {
  switch (m.role) {
    case "assistant":
      return {
        role: "assistant",
        content: m.content || null,
        ...(m.toolCalls?.length && {
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: "function" as const,
            function: { name: c.name, arguments: c.arguments },
          })),
        }),
      };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
    default:
      return { role: m.role, content: m.content };
  }
}

function toGatewayError(err: unknown): unknown {
  if (!(err instanceof OpenAI.APIError)) return err;
  switch (err.code) {
    case "terms_not_accepted":
      return gatewayError("error.termsNotAccepted", undefined, err.code);
    case "content_guard":
      return gatewayError("error.contentGuard", { message: err.message }, err.code);
  }
  if (err.status === 401) return gatewayError("error.unauthorized", undefined, "auth");
  if (err.status === 429) return gatewayError("error.rateLimited", undefined, "rate_limit");
  return gatewayError(
    "error.gateway",
    { status: err.status ?? "?", message: err.message },
    err.code ?? undefined,
  );
}

export class OpenAICompatibleProvider implements Provider {
  private readonly client: OpenAI;

  constructor(config: Pick<UstaConfig, "apiKey" | "baseUrl">) {
    if (!config.apiKey) throw gatewayError("error.noApiKey", undefined, "no_key");
    if (!config.baseUrl) throw gatewayError("error.noBaseUrl", undefined, "no_base_url");
    this.client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
  }

  async listModels(): Promise<string[]> {
    try {
      const page = await this.client.models.list();
      return page.data.map((m) => m.id);
    } catch (err) {
      throw toGatewayError(err);
    }
  }

  async *stream(req: ChatRequest): AsyncGenerator<ProviderEvent> {
    const partial = new Map<number, ToolCall>();
    let usage: Usage | undefined;
    try {
      const stream = await this.client.chat.completions.create(
        {
          model: req.model,
          messages: req.messages.map(toWire),
          stream: true,
          stream_options: { include_usage: true },
          ...(req.maxTokens && { max_tokens: req.maxTokens }),
          ...(req.temperature !== undefined && { temperature: req.temperature }),
          ...(req.tools?.length && {
            tools: req.tools.map((t) => ({
              type: "function" as const,
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
          }),
        },
        { signal: req.signal },
      );
      for await (const chunk of stream) {
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            cachedTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          };
        }
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) yield { type: "text", delta: delta.content };
        for (const tc of delta?.tool_calls ?? []) {
          const cur = partial.get(tc.index) ?? { id: "", name: "", arguments: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name += tc.function.name;
          if (tc.function?.arguments) cur.arguments += tc.function.arguments;
          partial.set(tc.index, cur);
        }
      }
    } catch (err) {
      throw toGatewayError(err);
    }
    const toolCalls = [...partial.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, c]) => ({ ...c, id: c.id || `call_${i}_${Date.now()}` }));
    yield { type: "finish", toolCalls, usage };
  }
}
