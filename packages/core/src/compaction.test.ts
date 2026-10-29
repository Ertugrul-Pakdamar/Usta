import { describe, expect, it } from "vitest";
import { compactMessages, findKeepFrom, isSummary, summaryMessage } from "./compaction.js";
import { MockProvider } from "./provider/mock.js";
import type { Message } from "./types.js";

const user = (c: string): Message => ({ role: "user", content: c });
const asst = (c: string): Message => ({ role: "assistant", content: c });
const turn = (n: number): Message[] => [user(`q${n}`), asst(`a${n}`)];

describe("findKeepFrom", () => {
  it("keeps the last N user prompts verbatim", () => {
    const msgs = [...turn(1), ...turn(2), ...turn(3), ...turn(4)];
    expect(findKeepFrom(msgs, 2)).toBe(4); // q3
  });

  it("never cuts inside a tool call / result pair", () => {
    const msgs: Message[] = [user("q1")];
    for (let i = 0; i < 6; i++) {
      msgs.push({
        role: "assistant",
        content: "",
        toolCalls: [{ id: `c${i}`, name: "Read", arguments: "{}" }],
      });
      msgs.push({ role: "tool", toolCallId: `c${i}`, content: "r" });
    }
    const at = findKeepFrom(msgs, 2) as number;
    expect(msgs[at]?.role).toBe("assistant");
    expect(at).toBeGreaterThan(0);
    expect(msgs.length - at).toBeGreaterThanOrEqual(8);
  });

  it("returns undefined when there is nothing to compact", () => {
    expect(findKeepFrom([...turn(1), ...turn(2)], 2)).toBeUndefined();
  });

  it("does not count an earlier summary as a user prompt", () => {
    const msgs = [summaryMessage("old"), ...turn(1), ...turn(2), ...turn(3)];
    expect(isSummary(msgs[0] as Message)).toBe(true);
    expect(findKeepFrom(msgs, 2)).toBe(3); // keeps q2,q3; the old summary and q1 are compacted
    expect(findKeepFrom([summaryMessage("old"), ...turn(1), ...turn(2)], 2)).toBeUndefined();
  });
});

describe("compactMessages", () => {
  it("replaces the head with one summary message and keeps the tail", async () => {
    const provider = new MockProvider([{ text: "  Goal: fix bug.  " }]);
    const msgs = [...turn(1), ...turn(2), ...turn(3), ...turn(4)];
    const r = await compactMessages({ provider, model: "fast", messages: msgs, keepTurns: 2 });
    expect(r?.keepFrom).toBe(4);
    expect(r?.messages).toHaveLength(1 + 4);
    expect(r?.messages[0]?.content).toContain("Goal: fix bug.");
    expect(r?.messages.slice(1)).toEqual(msgs.slice(4));
    expect(provider.requests[0]?.model).toBe("fast");
  });

  it("caps tool results in the transcript it sends and honours the focus instruction", async () => {
    const provider = new MockProvider([{ text: "ok" }]);
    const msgs: Message[] = [
      user("q1"),
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "1", name: "Read", arguments: '{"path":"a"}' }],
      },
      { role: "tool", toolCallId: "1", content: "R".repeat(10_000) },
      ...turn(2),
      ...turn(3),
    ];
    await compactMessages({ provider, model: "m", messages: msgs, instruction: "the auth bug" });
    const sent = String(provider.requests[0]?.messages[1]?.content);
    expect(sent).toContain("TOOL_CALL Read");
    expect(sent.length).toBeLessThan(4_000);
    expect(sent).toContain("the auth bug");
  });

  it("tells the summarizer it only sees the older part, so it cannot claim nothing else happened", async () => {
    const provider = new MockProvider([{ text: "ok" }]);
    await compactMessages({ provider, model: "m", messages: [...turn(1), ...turn(2), ...turn(3)] });
    expect(String(provider.requests[0]?.messages[0]?.content)).toContain("OLDER part");
  });

  it("fails on an empty summary", async () => {
    await expect(
      compactMessages({
        provider: new MockProvider([{ text: "   " }]),
        model: "m",
        messages: [...turn(1), ...turn(2), ...turn(3)],
      }),
    ).rejects.toThrow("boş");
  });
});
