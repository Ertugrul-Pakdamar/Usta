import { describe, expect, it } from "vitest";
import { formatTokens, summarizeCall, summarizeOutput } from "./format.js";

describe("format", () => {
  it("summarizes calls by their main argument", () => {
    expect(summarizeCall("Read", '{"path":"src/a.ts","offset":3}')).toBe("Read(src/a.ts)");
    expect(summarizeCall("Bash", '{"command":"ls\\nrm x"}')).toBe("Bash(ls)");
    expect(summarizeCall("Bash", "{oops")).toBe("Bash({oops)");
  });

  it("clips long output and counts the rest", () => {
    expect(summarizeOutput("a\nb\nc\nd\ne")).toBe("a\nb\nc\n… +2 satır");
  });

  it("abbreviates token counts", () => {
    expect([formatTokens(999), formatTokens(2390)]).toEqual(["999", "2.4k"]);
  });
});
