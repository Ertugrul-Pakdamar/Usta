import { describe, expect, it } from "vitest";
import { extractTextToolCalls } from "./text-tool-calls.js";

describe("extractTextToolCalls", () => {
  it("extracts calls and strips them from the text", () => {
    const r = extractTextToolCalls('ok <tool_call>{"name":"A","arguments":{"x":1}}</tool_call>');
    expect(r.text).toBe("ok");
    expect(r.toolCalls[0]).toMatchObject({ name: "A", arguments: '{"x":1}' });
  });

  it("leaves malformed blocks untouched", () => {
    const text = "<tool_call>{oops</tool_call>";
    expect(extractTextToolCalls(text)).toEqual({ text, toolCalls: [] });
  });
});
