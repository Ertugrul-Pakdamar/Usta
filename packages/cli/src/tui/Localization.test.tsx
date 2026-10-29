import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_LANGUAGE,
  MockProvider,
  type MockTurn,
  PermissionEngine,
  setLanguage,
  type UstaConfig,
} from "@usta/core";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

const config: UstaConfig = { apiKey: "k", baseUrl: "http://x", model: "m", maxTokens: undefined };
let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-l10n-cwd-"));
  process.env.HOME = await mkdtemp(join(tmpdir(), "usta-l10n-home-"));
});
afterEach(() => setLanguage(DEFAULT_LANGUAGE));

const mount = (turns: MockTurn[], extra = {}) => {
  const provider = new MockProvider(turns);
  return {
    provider,
    ...render(<App provider={provider} config={config} cwd={cwd} model="m" {...extra} />),
  };
};

async function waitFor(ui: { lastFrame(): string | undefined }, text: string, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ui.lastFrame()?.includes(text)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`"${text}" not seen. Last screen:\n${ui.lastFrame()}`);
}
const type = async (ui: { stdin: { write(s: string): void } }, text: string) => {
  ui.stdin.write(text);
  await new Promise((r) => setTimeout(r, 30));
  ui.stdin.write("\r");
};

describe("English interface", () => {
  it("shows the approval box, status bar and results in English", async () => {
    setLanguage("en");
    const ui = mount([
      { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "hi\n" } }] },
      { text: "done" },
    ]);
    await waitFor(ui, "ask (⇧Tab)");
    await type(ui, "write a file");
    await waitFor(ui, "Permission required: Write(a.txt)");
    await waitFor(ui, "[y] yes");
    await waitFor(ui, "auto-accept edits in the working directory");
    ui.stdin.write("y");
    await waitFor(ui, "done");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("hi\n");
    ui.unmount();
  });

  it("plan approval and the review prompt are translated", async () => {
    setLanguage("en");
    const engine = new PermissionEngine({ cwd, mode: "plan" });
    const ui = mount(
      [{ toolCalls: [{ name: "ExitPlanMode", args: { plan: "1. do it" } }] }, { text: "ok" }],
      { engine },
    );
    await type(ui, "plan it");
    await waitFor(ui, "Plan approval");
    await waitFor(ui, "approve and auto-accept edits");
    ui.stdin.write("n");
    await waitFor(ui, "ok");
    ui.unmount();
  });

  it("a denied call is explained in English to the user and in English to the model", async () => {
    setLanguage("en");
    const engine = new PermissionEngine({ cwd, deny: ["Bash(rm:*)"], mode: "bypass" });
    const ui = mount(
      [{ toolCalls: [{ name: "Bash", args: { command: "rm a.txt" } }] }, { text: "blocked" }],
      { engine },
    );
    await type(ui, "delete it");
    await waitFor(ui, "Bash was not allowed: Blocked by rule: Bash(rm:*)");
    await waitFor(ui, "blocked");
    ui.unmount();
  });

  it("slash command output is translated (/cost)", async () => {
    setLanguage("en");
    const ui = mount([{ text: "hello" }]);
    await type(ui, "hi");
    await waitFor(ui, "hello");
    await type(ui, "/cost");
    await waitFor(ui, "This session: 1 request");
    ui.unmount();
  });
});

describe("/lang", () => {
  it("switches the language during a session, in both directions", async () => {
    const ui = mount([]);
    await waitFor(ui, "izin sor (⇧Tab)");
    await type(ui, "/lang");
    await waitFor(ui, "Dil: tr");
    await type(ui, "/lang en");
    await waitFor(ui, "Language: en");
    await type(ui, "/help");
    await waitFor(ui, "List commands and shortcuts");
    await type(ui, "/lang tr");
    await waitFor(ui, "Dil: tr");
    await type(ui, "/help");
    await waitFor(ui, "Komutları ve kısayolları listeler");
    ui.unmount();
  });

  it("rejects an unsupported language and keeps the current one", async () => {
    const ui = mount([]);
    await type(ui, "/lang klingon");
    await waitFor(ui, "Desteklenmeyen dil: klingon");
    await type(ui, "/lang");
    await waitFor(ui, "Dil: tr");
    ui.unmount();
  });
});
