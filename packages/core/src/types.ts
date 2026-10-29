export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON string exactly as the model produced it. */
  arguments: string;
}

export type Message =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments. */
  parameters: Record<string, unknown>;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from the gateway's prefix cache. */
  cachedTokens?: number;
}

export interface ChatRequest {
  model: string;
  messages: Message[];
  tools?: ToolSpec[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export type ProviderEvent =
  | { type: "text"; delta: string }
  | { type: "finish"; toolCalls: ToolCall[]; usage?: Usage };

/** Everything model-specific lives behind this interface. */
export interface Provider {
  stream(req: ChatRequest): AsyncIterable<ProviderEvent>;
  /** Model ids the endpoint offers, when it can tell. */
  listModels?(): Promise<string[]>;
}
