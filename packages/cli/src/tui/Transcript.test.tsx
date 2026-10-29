import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { ItemView } from "./Transcript.js";

const long = "uzun/dizin/yolu/".repeat(20);

describe("ItemView with long text", () => {
  it("keeps the banner name when the path is wider than the terminal", () => {
    const { lastFrame } = render(
      <ItemView item={{ id: 0, kind: "banner", text: `v0 · m · /${long}` }} width={100} />,
    );
    expect(lastFrame()).toContain("usta");
  });

  it("keeps the user and assistant prefixes next to long text", () => {
    const user = render(<ItemView item={{ id: 0, kind: "user", text: long }} width={100} />);
    expect(user.lastFrame()).toContain("› ");
    const assistant = render(
      <ItemView item={{ id: 1, kind: "assistant", text: long }} width={100} />,
    );
    expect(assistant.lastFrame()).toContain("● ");
  });
});
