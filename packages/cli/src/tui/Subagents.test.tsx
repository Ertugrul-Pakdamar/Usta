import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ChatRequest,
  MockProvider,
  type MockTurn,
  PermissionEngine,
  type Provider,
  type ProviderEvent,
  type UstaConfig,
} from "@usta/core";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

const config: UstaConfig = { apiKey: "k", baseUrl: "http://x", model: "m", maxTokens: undefined };
let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-sub-cwd-"));
  process.env.HOME = await mkdtemp(join(tmpdir(), "usta-sub-home-"));
});

/**
 * One provider for the main agent and its subagents. Requests are routed by the system
 * prompt (subagent prompts say "working for a parent agent"), so each side consumes its own script and the
 * order in which they run does not matter.
 */
function routed(main: MockTurn[], sub: MockTurn[] | Provider) {
  const mainP = new MockProvider(main);
  const subP = Array.isArray(sub) ? new MockProvider(sub) : sub;
  const provider: Provider = {
    stream(req: ChatRequest): AsyncIterable<ProviderEvent> {
      return String(req.messages[0]?.content).includes("working for a parent agent")
        ? subP.stream(req)
        : mainP.stream(req);
    },
  };
  return { provider, mainP, subP: subP as MockProvider };
}

const mount = (provider: Provider, extra = {}) =>
  render(<App provider={provider} config={config} cwd={cwd} model="m" {...extra} />);

async function waitFor(ui: { lastFrame(): string | undefined }, text: string, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (ui.lastFrame()?.includes(text)) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`"${text}" görünmedi. Son ekran:\n${ui.lastFrame()}`);
}
const type = async (ui: { stdin: { write(s: string): void } }, text: string) => {
  ui.stdin.write(text);
  await new Promise((r) => setTimeout(r, 30));
  ui.stdin.write("\r");
};
const count = (frame: string | undefined, text: string) =>
  frame?.split(text).length ? frame.split(text).length - 1 : 0;

const task = (args: Record<string, unknown>) => ({ name: "Task", args });

describe("Task in the interface", () => {
  it("only the subagent's report reaches the main conversation, not its working steps", async () => {
    const { provider, mainP, subP } = routed(
      [
        {
          toolCalls: [
            task({ description: "find auth", prompt: "where is auth?", agent: "explore" }),
          ],
        },
        { text: "done" },
      ],
      [
        { toolCalls: [{ name: "Glob", args: { pattern: "*" } }] },
        { text: "AUTH IS IN src/auth.ts:12" },
      ],
    );
    const ui = mount(provider);
    await type(ui, "where is auth");
    await waitFor(ui, "done");
    await waitFor(ui, "Task(find auth)");
    const conversation = mainP.requests.at(-1)?.messages.filter((m) => m.role !== "system");
    const finalMain = JSON.stringify(conversation);
    expect(finalMain).toContain("AUTH IS IN src/auth.ts:12");
    expect(finalMain).not.toContain("Glob"); // the subagent's own tool call stays in its context
    expect(subP.requests[0]?.messages).toHaveLength(2); // system + the delegated prompt only
    ui.unmount();
  });

  it("a subagent's approval box names the agent, and the write happens after 'y'", async () => {
    const { provider } = routed(
      [
        {
          toolCalls: [task({ description: "make file", prompt: "write a.txt", agent: "general" })],
        },
        { text: "done" },
      ],
      [
        { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "hi\n" } }] },
        { text: "wrote it" },
      ],
    );
    const ui = mount(provider);
    await type(ui, "do it");
    await waitFor(ui, "İzin gerekiyor (general): Write(a.txt)");
    await waitFor(ui, "+hi");
    ui.stdin.write("y");
    await waitFor(ui, "done");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("hi\n");
    ui.unmount();
  });

  it("parallel subagents ask one at a time (a single box is ever open)", async () => {
    const read = { toolCalls: [{ name: "Read", args: { path: "/etc/hostname" } }] };
    const { provider } = routed(
      [
        {
          toolCalls: [
            task({ description: "one", prompt: "p1", agent: "explore" }),
            task({ description: "two", prompt: "p2", agent: "explore" }),
          ],
        },
        { text: "done" },
      ],
      [read, read, { text: "R1" }, { text: "R2" }],
    );
    const ui = mount(provider);
    await type(ui, "go");
    await waitFor(ui, "İzin gerekiyor (explore)");
    await new Promise((r) => setTimeout(r, 150)); // the second subagent has asked by now
    expect(count(ui.lastFrame(), "İzin gerekiyor")).toBe(1);
    ui.stdin.write("y");
    await new Promise((r) => setTimeout(r, 200)); // let the first box close
    await waitFor(ui, "İzin gerekiyor (explore)"); // the second question takes its place
    ui.stdin.write("y");
    await waitFor(ui, "done");
    ui.unmount();
  });

  it("aborting denies the questions still waiting in the queue", async () => {
    const read = { toolCalls: [{ name: "Read", args: { path: "/etc/hostname" } }] };
    const { provider } = routed(
      [
        {
          toolCalls: [
            task({ description: "one", prompt: "p1", agent: "explore" }),
            task({ description: "two", prompt: "p2", agent: "explore" }),
          ],
        },
        { text: "after abort" },
      ],
      [read, read, { text: "x" }, { text: "y" }],
    );
    const ui = mount(provider);
    await type(ui, "go");
    await waitFor(ui, "İzin gerekiyor (explore)");
    ui.stdin.write("\u0003"); // Ctrl+C while busy
    await waitFor(ui, "İptal edildi");
    await new Promise((r) => setTimeout(r, 200));
    expect(ui.lastFrame()).not.toContain("İzin gerekiyor");
    ui.unmount();
  });
});

/** A subagent provider that never finishes until it is cancelled. */
const hanging = (): Provider => ({
  async *stream(req): AsyncGenerator<ProviderEvent> {
    await new Promise((resolve) => req.signal?.addEventListener("abort", resolve, { once: true }));
    throw new Error("aborted");
  },
});

describe("background tasks", () => {
  it("/tasks lists them, shows the status bar counter, and /tasks stop cancels", async () => {
    const { provider } = routed(
      [
        {
          toolCalls: [
            task({ description: "long scan", prompt: "p", agent: "explore", background: true }),
          ],
        },
        { text: "started" },
      ],
      hanging(),
    );
    const ui = mount(provider);
    await type(ui, "scan in background");
    await waitFor(ui, "started");
    await waitFor(ui, "⚙ 1 görev");
    await type(ui, "/tasks");
    await waitFor(ui, "t1  çalışıyor  explore: long scan");
    await type(ui, "/tasks stop t1");
    await waitFor(ui, "t1 görevi durduruluyor");
    await waitFor(ui, "t1 görevi iptal edildi");
    await type(ui, "/tasks");
    await waitFor(ui, "t1  iptal");
    ui.unmount();
  });

  it("tells the user when it finishes and passes the report to the model with the next message", async () => {
    const { provider, mainP } = routed(
      [
        {
          toolCalls: [
            task({ description: "scan", prompt: "p", agent: "explore", background: true }),
          ],
        },
        { text: "started" },
        { text: "got it" },
      ],
      [{ text: "BACKGROUND REPORT" }],
    );
    const ui = mount(provider);
    await type(ui, "scan");
    await waitFor(ui, "started");
    await waitFor(ui, "✓ t1 görevi bitti: scan");
    await type(ui, "what did it find?");
    await waitFor(ui, "got it");
    const last = JSON.stringify(mainP.requests.at(-1)?.messages);
    expect(last).toContain('<task-notification id=\\"t1\\" agent=\\"explore\\" status=\\"done\\"');
    expect(last).toContain("BACKGROUND REPORT");
    ui.unmount();
  });

  it("/tasks show prints the report without marking it as delivered", async () => {
    const { provider, mainP } = routed(
      [
        {
          toolCalls: [
            task({ description: "scan", prompt: "p", agent: "explore", background: true }),
          ],
        },
        { text: "started" },
        { text: "ok" },
      ],
      [{ text: "SECRET FINDING" }],
    );
    const ui = mount(provider);
    await type(ui, "scan");
    await waitFor(ui, "✓ t1 görevi bitti");
    await type(ui, "/tasks show t1");
    await waitFor(ui, "SECRET FINDING");
    await type(ui, "next");
    await waitFor(ui, "ok");
    expect(JSON.stringify(mainP.requests.at(-1)?.messages)).toContain("SECRET FINDING"); // still delivered to the model
    ui.unmount();
  });

  it("reports unknown ids and shows usage for a malformed command", async () => {
    const ui = mount(routed([], []).provider);
    await type(ui, "/tasks stop t9");
    await waitFor(ui, "t9 kimlikli görev yok");
    await type(ui, "/tasks bogus");
    await waitFor(ui, "Kullanım: /tasks");
    ui.unmount();
  });

  it("a deny rule on an agent stops the delegation", async () => {
    const { provider } = routed(
      [
        { toolCalls: [task({ description: "x", prompt: "p", agent: "general" })] },
        { text: "blocked" },
      ],
      [],
    );
    const engine = new PermissionEngine({ cwd, deny: ["Task(general)"] });
    const ui = mount(provider, { engine });
    await type(ui, "delegate");
    await waitFor(ui, "Task çağrısına izin verilmedi: Kural engelledi: Task(general)");
    ui.unmount();
  });
});
