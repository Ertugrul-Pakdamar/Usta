import type { ChatRequest, Provider, ProviderEvent, ToolCall } from "../types.js";

export interface MockTurn {
  text?: string;
  toolCalls?: { name: string; args: unknown }[];
}

/** Replays scripted turns; records every request. For tests and offline demos. */
export class MockProvider implements Provider {
  readonly requests: ChatRequest[] = [];
  private i = 0;

  constructor(private readonly turns: MockTurn[]) {}

  async *stream(req: ChatRequest): AsyncGenerator<ProviderEvent> {
    this.requests.push(structuredClone({ ...req, signal: undefined }));
    const turn = this.turns[this.i++] ?? { text: "(script bitti)" };
    if (turn.text) yield { type: "text", delta: turn.text };
    const toolCalls: ToolCall[] = (turn.toolCalls ?? []).map((c, n) => ({
      id: `mock_${this.i}_${n}`,
      name: c.name,
      arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args),
    }));
    yield { type: "finish", toolCalls, usage: { promptTokens: 10, completionTokens: 5 } };
  }
}
