// The numbers quoted in the README and docs/vs-claude-code.md come from the published raw results;
// this keeps the claim and the data from drifting apart.
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(dirname(fileURLToPath(import.meta.url)), "compare.mjs");
const data = JSON.parse(execFileSync(process.execPath, [script, "--json"], { encoding: "utf8" }));

describe("usta vs Claude Code (published results)", () => {
  it("supports the headline numbers used in the documentation", () => {
    const { usta, cc, tokenRatio, freshRatio } = data.overall;
    expect(`${usta.ok}/${usta.n}`).toBe("30/33");
    expect(`${cc.ok}/${cc.n}`).toBe("24/30");
    expect(tokenRatio).toBeGreaterThan(13);
    expect(tokenRatio).toBeLessThan(14);
    expect(freshRatio).toBeGreaterThan(7.5);
    expect(freshRatio).toBeLessThan(8.5);
  });

  it("covers the same ten tasks for both tools", () => {
    expect(data.rows).toHaveLength(10);
    for (const r of data.rows) expect(r.cc.n).toBeGreaterThan(0);
  });
});
