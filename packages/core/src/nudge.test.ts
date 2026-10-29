import { describe, expect, it } from "vitest";
import { BulkEditNudge } from "./nudge.js";

const edit = (path: string, a = "old", b = "new") => ({ path, old_string: a, new_string: b });

describe("BulkEditNudge", () => {
  it("hints once when the same replacement hits three files", () => {
    const n = new BulkEditNudge();
    expect(n.observe("Edit", edit("a"))).toBeUndefined();
    expect(n.observe("Edit", edit("b"))).toBeUndefined();
    expect(n.observe("Edit", edit("c"))).toContain("same replacement in 3 files");
    expect(n.observe("Edit", edit("d"))).toBeUndefined();
  });

  it("different replacements do not add up, the same file repeated does not count twice", () => {
    const n = new BulkEditNudge();
    n.observe("Edit", edit("a", "x", "1"));
    n.observe("Edit", edit("b", "y", "2"));
    n.observe("Edit", edit("a", "x", "1"));
    expect(n.observe("Edit", edit("c", "z", "3"))).toBeUndefined();
  });

  it("hints after six separate edits even if they differ, only once", () => {
    const n = new BulkEditNudge();
    const hints = Array.from({ length: 8 }, (_, i) =>
      n.observe("Write", { path: `f${i}`, content: "x" }),
    ).filter(Boolean);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain("6 separate file edits");
  });

  it("ignores other tools", () => {
    const n = new BulkEditNudge();
    for (let i = 0; i < 10; i++) expect(n.observe("Read", { path: "a" })).toBeUndefined();
  });
});
