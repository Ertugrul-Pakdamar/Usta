import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeFences, renderMarkdown, tidy } from "./markdown.js";

afterEach(() => vi.restoreAllMocks());

describe("normalizeFences", () => {
  it("keeps known languages and rewrites unknown ones", () => {
    const text =
      "```ts\nlet a = 1\n```\n\n```env\nA=1\n```\n\n~~~dotenv\nB=2\n~~~\n\n```\nplain\n```";
    expect(normalizeFences(text)).toBe(
      "```ts\nlet a = 1\n```\n\n```plaintext\nA=1\n```\n\n~~~plaintext\nB=2\n~~~\n\n```\nplain\n```",
    );
  });
});

describe("renderMarkdown", () => {
  it("does not print 'Could not find the language' for an unknown fence", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = renderMarkdown("```env\nJWT_SECRET=x\n```", 80);
    expect(out).toContain("JWT_SECRET=x");
    expect(errors).not.toHaveBeenCalled();
  });

  it("still renders known languages", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(renderMarkdown("```go\nfunc main() {}\n```", 80)).toContain("main");
    expect(errors).not.toHaveBeenCalled();
  });
});

describe("tidy", () => {
  it("collapses runs of blank lines to one", () => {
    expect(tidy("a\n\n\n\n  \n\nb")).toBe("a\n\nb");
    expect(tidy("a\n\nb")).toBe("a\n\nb");
  });
});
