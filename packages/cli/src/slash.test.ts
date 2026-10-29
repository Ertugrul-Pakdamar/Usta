import { describe, expect, it } from "vitest";
import { parseSlash, slashCommands } from "./slash.js";

describe("parseSlash", () => {
  it("splits name and args", () => {
    expect(parseSlash("/model  qwen3 vl")).toEqual({ name: "model", args: "qwen3 vl" });
    expect(parseSlash("/help")).toEqual({ name: "help", args: "" });
  });

  it("ignores non-commands", () => {
    expect(parseSlash("merhaba")).toBeUndefined();
  });

  it("has unique command names", () => {
    const names = slashCommands.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
