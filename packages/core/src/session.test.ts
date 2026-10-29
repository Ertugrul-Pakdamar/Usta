import { appendFileSync, statSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendCompaction,
  appendMessage,
  createSession,
  findSession,
  listSessions,
  loadSession,
  truncateSession,
} from "./session.js";

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "usta-home-"));
});

describe("sessions", () => {
  it("round-trips messages through JSONL with private permissions", () => {
    const s = createSession("/p", "m", home);
    appendMessage(s, { role: "user", content: "selam" });
    appendMessage(s, { role: "assistant", content: "merhaba" });
    expect(loadSession(s.path).messages).toHaveLength(2);
    expect(statSync(s.path).mode & 0o777).toBe(0o600);
  });

  it("ignores a torn last line", () => {
    const s = createSession("/p", "m", home);
    appendMessage(s, { role: "user", content: "a" });
    appendFileSync(s.path, '{"type":"message","mess');
    expect(loadSession(s.path).messages).toHaveLength(1);
  });

  it("drops an assistant tool-call turn whose results are missing", () => {
    const s = createSession("/p", "m", home);
    appendMessage(s, { role: "user", content: "a" });
    appendMessage(s, {
      role: "assistant",
      content: "",
      toolCalls: [{ id: "1", name: "Read", arguments: "{}" }],
    });
    expect(loadSession(s.path).messages).toEqual([{ role: "user", content: "a" }]);
  });

  it("masks the API key", () => {
    process.env.EVREN_API_KEY = "sk-super-secret-key";
    const s = createSession("/p", "m", home);
    appendMessage(s, { role: "tool", toolCallId: "1", content: "key=sk-super-secret-key" });
    expect(JSON.stringify(loadSession(s.path).messages)).not.toContain("super-secret");
    delete process.env.EVREN_API_KEY;
  });

  it("finds the latest session of a directory or by id prefix", () => {
    const a = createSession("/a", "m", home);
    appendMessage(a, { role: "user", content: "first" });
    createSession("/b", "m", home);
    expect(findSession("/a", undefined, home)?.id).toBe(a.meta.id);
    expect(findSession("/zzz", a.meta.id, home)?.preview).toBe("first");
    expect(listSessions(home)).toHaveLength(2);
  });
});

describe("compaction records", () => {
  it("replays a compaction: summary replaces the first keepFrom messages", () => {
    const s = createSession("/p", "m", home);
    for (const c of ["q1", "a1", "q2", "a2"])
      appendMessage(s, { role: c.startsWith("q") ? "user" : "assistant", content: c });
    appendCompaction(s, "SUM", 2);
    appendMessage(s, { role: "user", content: "q3" });
    const msgs = loadSession(s.path).messages;
    expect(msgs.map((m) => m.content.slice(0, 22))).toEqual([
      "<conversation-summary>",
      "q2",
      "a2",
      "q3",
    ]);
    expect(msgs[0]?.content).toContain("SUM");
  });

  it("a truncate after a compaction counts from the compacted list", () => {
    const s = createSession("/p", "m", home);
    for (const c of ["q1", "a1", "q2", "a2"])
      appendMessage(s, { role: c.startsWith("q") ? "user" : "assistant", content: c });
    appendCompaction(s, "SUM", 2);
    truncateSession(s, 2);
    expect(loadSession(s.path).messages.map((m) => m.content.slice(0, 2))).toEqual(["<c", "q2"]);
  });
});
