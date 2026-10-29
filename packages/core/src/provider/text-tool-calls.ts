import type { ToolCall } from "../types.js";

const BLOCK = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;

/**
 * Fallback for models/servers that emit tool calls as text (Qwen/Hermes style
 * `<tool_call>{"name":…,"arguments":{…}}</tool_call>`) instead of native tool_calls.
 */
export function extractTextToolCalls(text: string): { text: string; toolCalls: ToolCall[] } {
  const toolCalls: ToolCall[] = [];
  const rest = text.replace(BLOCK, (whole, body: string) => {
    try {
      const parsed = JSON.parse(body) as { name?: unknown; arguments?: unknown };
      if (typeof parsed.name !== "string") return whole;
      const args = parsed.arguments ?? {};
      toolCalls.push({
        id: `text_${toolCalls.length}_${Date.now()}`,
        name: parsed.name,
        arguments: typeof args === "string" ? args : JSON.stringify(args),
      });
      return "";
    } catch {
      return whole;
    }
  });
  return { text: toolCalls.length ? rest.trim() : text, toolCalls };
}
