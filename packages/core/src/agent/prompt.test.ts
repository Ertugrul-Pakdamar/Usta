import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "./prompt.js";

describe("buildSystemPrompt", () => {
  it("mentions Script and Task by default", () => {
    const p = buildSystemPrompt("/p");
    expect(p).toContain("Script tool");
    expect(p).toContain("subagents with Task");
  });

  it("leaves out the lines of disabled tools (and nothing else)", () => {
    const p = buildSystemPrompt("/p", { without: ["Script", "Task"] });
    expect(p).not.toContain("Script");
    expect(p).not.toContain("Task");
    expect(p).toContain("Call independent tools in the same turn");
    expect(p).toContain("Working directory: /p");
    expect(buildSystemPrompt("/p", { without: ["Script"] })).toContain("subagents with Task");
  });
});
