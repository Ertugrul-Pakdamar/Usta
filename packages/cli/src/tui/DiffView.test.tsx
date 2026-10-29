import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { DiffView } from "./DiffView.js";

describe("DiffView", () => {
  const diff = ["@@ -1,2 +1,2 @@", " keep", '-const old = "x";', '+const next = "y"; // why'].join(
    "\n",
  );

  it("renders every line of the diff with its marker and the full code text", () => {
    const frame = render(<DiffView diff={diff} path="src/a.ts" />).lastFrame() ?? "";
    for (const line of diff.split("\n")) expect(frame).toContain(line);
  });

  it("works for unknown languages, per-file headers in multi-file diffs, and long diffs", () => {
    const multi = [
      "--- a/x.py",
      "+++ b/x.py",
      "@@ -1 +1 @@",
      "-a = 1",
      "+def f(): pass  # hi",
    ].join("\n");
    expect(render(<DiffView diff={multi} />).lastFrame()).toContain("+def f(): pass  # hi");
    expect(render(<DiffView diff="+plain" path="Makefile" />).lastFrame()).toContain("+plain");
    const long = Array.from({ length: 40 }, (_, i) => `+line ${i}`).join("\n");
    expect(render(<DiffView diff={long} />).lastFrame()).toContain("10");
  });
});
