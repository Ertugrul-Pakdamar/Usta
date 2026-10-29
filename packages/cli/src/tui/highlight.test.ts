import { describe, expect, it } from "vitest";
import { languageOf, tokenize } from "./highlight.js";

describe("tokenize", () => {
  const kinds = (line: string, lang: string) =>
    tokenize(line, lang).map((t) => `${t.kind}:${t.text}`);

  it("marks keywords, strings, numbers and trailing comments", () => {
    expect(kinds('const x = "a b" + 42; // note', "js")).toEqual([
      "keyword:const",
      "plain: x = ",
      'string:"a b"',
      "plain: + ",
      "number:42",
      "plain:; ",
      "comment:// note",
    ]);
  });

  it("handles escapes inside strings and unterminated strings", () => {
    expect(kinds('"a\\"b" x', "js")[0]).toBe('string:"a\\"b"');
    expect(kinds('say("oops', "js").at(-1)).toBe('string:"oops');
  });

  it("does not treat digits inside identifiers as numbers", () => {
    expect(kinds("x1 = y2", "js")).toEqual(["plain:x1 = y2"]);
  });

  it("uses # comments for python and shell, keywords per language", () => {
    expect(kinds("def f(): # hi", "py")).toEqual(["keyword:def", "plain: f(): ", "comment:# hi"]);
    expect(kinds("fn main() {}", "rs")[0]).toBe("keyword:fn");
  });

  it("reassembles to the original line, and unknown languages stay plain", () => {
    const line = 'if (a == "x") { return 0x1F; } // end';
    expect(
      tokenize(line, "js")
        .map((t) => t.text)
        .join(""),
    ).toBe(line);
    expect(tokenize(line, undefined)).toEqual([{ text: line, kind: "plain" }]);
  });
});

describe("languageOf", () => {
  it("maps extensions", () => {
    expect(languageOf("src/a.ts")).toBe("js");
    expect(languageOf("x.PY")).toBe("py");
    expect(languageOf("Makefile")).toBeUndefined();
    expect(languageOf(undefined)).toBeUndefined();
  });
});
