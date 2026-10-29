import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Economy,
  MockProvider,
  type MockTurn,
  ModelRegistry,
  PermissionEngine,
  type UstaConfig,
} from "@usta/core";
import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

const config: UstaConfig = { apiKey: "k", baseUrl: "http://x", model: "m", maxTokens: undefined };
let cwd: string;
let home: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "usta-cwd-"));
  home = await mkdtemp(join(tmpdir(), "usta-home-"));
  process.env.HOME = home; // sessions are written under ~/.usta
});

const mount = (turns: MockTurn[], extra = {}) => {
  const provider = new MockProvider(turns);
  const ui = render(<App provider={provider} config={config} cwd={cwd} model="m" {...extra} />);
  return { provider, ...ui };
};

async function waitFor(ui: { lastFrame(): string | undefined }, text: string, ms = 3000) {
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

describe("App", () => {
  it("sends a prompt and shows the reply with token usage", async () => {
    const ui = mount([{ text: "Merhaba dünya" }]);
    await type(ui, "selam");
    await waitFor(ui, "Merhaba dünya");
    await waitFor(ui, "↑10");
    ui.unmount();
  });

  it("asks before writing, shows the diff, and applies on 'y'", async () => {
    const ui = mount([
      { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "hi\n" } }] },
      { text: "yazıldı" },
    ]);
    await type(ui, "dosya yaz");
    await waitFor(ui, "İzin gerekiyor");
    await waitFor(ui, "+hi");
    ui.stdin.write("y");
    await waitFor(ui, "yazıldı");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("hi\n");
    ui.unmount();
  });

  it("denies on 'n' and tells the model", async () => {
    const ui = mount([
      { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "hi" } }] },
      { text: "tamam" },
    ]);
    await type(ui, "dosya yaz");
    await waitFor(ui, "İzin gerekiyor");
    ui.stdin.write("n");
    await waitFor(ui, "tamam");
    await expect(readFile(join(cwd, "a.txt"))).rejects.toThrow();
    ui.unmount();
  });

  it("'a' allows the tool for the rest of the session", async () => {
    const call = (n: string) => ({
      toolCalls: [{ name: "Write", args: { path: n, content: "x" } }],
    });
    const ui = mount([call("1.txt"), call("2.txt"), { text: "bitti" }]);
    await type(ui, "iki dosya");
    await waitFor(ui, "İzin gerekiyor");
    ui.stdin.write("a");
    await waitFor(ui, "bitti");
    expect(await readFile(join(cwd, "2.txt"), "utf8")).toBe("x");
    ui.unmount();
  });

  it("runs slash commands locally without calling the model", async () => {
    const ui = mount([]);
    await type(ui, "/help");
    await waitFor(ui, "/clear");
    await type(ui, "/model yeni-model");
    await waitFor(ui, "Model değişti: yeni-model");
    await type(ui, "/nope");
    await waitFor(ui, "Bilinmeyen komut");
    ui.unmount();
  });

  it("runs !shell commands directly", async () => {
    const ui = mount([]);
    await type(ui, "!echo selam-shell");
    await waitFor(ui, "selam-shell");
    ui.unmount();
  });

  it("shows an error from the provider instead of crashing", async () => {
    const provider = {
      async *stream() {
        throw new Error("kota aşıldı");
      },
    };
    const ui = render(<App provider={provider} config={config} cwd={cwd} model="m" />);
    await type(ui, "merhaba");
    await waitFor(ui, "kota aşıldı");
    ui.unmount();
  });

  it("resumes a transcript and continues the conversation", async () => {
    const { createSession, appendMessage, loadSession } = await import("@usta/core");
    const s = createSession(cwd, "m", home);
    appendMessage(s, { role: "user", content: "eski soru" });
    appendMessage(s, { role: "assistant", content: "eski cevap" });
    const provider = new MockProvider([{ text: "yeni cevap" }]);
    const ui = render(
      <App provider={provider} config={config} cwd={cwd} model="m" resume={loadSession(s.path)} />,
    );
    await waitFor(ui, "eski cevap");
    await type(ui, "devam");
    await waitFor(ui, "yeni cevap");
    const sent = JSON.stringify(provider.requests[0]?.messages);
    expect(sent).toContain("eski soru");
    expect(loadSession(s.path).messages).toHaveLength(4);
    ui.unmount();
  });

  it("starts with an initial prompt", async () => {
    const ui = mount([{ text: "başlangıç cevabı" }], { initialPrompt: "ilk soru" });
    await waitFor(ui, "başlangıç cevabı");
    ui.unmount();
  });

  it("never prompts for read-only tools", async () => {
    await writeFile(join(cwd, "a.txt"), "icerik-a");
    const ui = mount([
      { toolCalls: [{ name: "Read", args: { path: "a.txt" } }] },
      { text: "okudum" },
    ]);
    await type(ui, "oku");
    await waitFor(ui, "okudum");
    expect(ui.lastFrame()).not.toContain("İzin gerekiyor");
    ui.unmount();
  });

  it("a deny rule blocks without a prompt and the reason reaches the model", async () => {
    await writeFile(join(cwd, "a.txt"), "x");
    const engine = new PermissionEngine({ cwd, deny: ["Bash(rm:*)"], mode: "bypass" });
    const ui = mount(
      [{ toolCalls: [{ name: "Bash", args: { command: "rm a.txt" } }] }, { text: "engellendi" }],
      { engine },
    );
    await type(ui, "sil");
    await waitFor(ui, "engellendi");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("x");
    expect(ui.lastFrame()).not.toContain("İzin gerekiyor");
    ui.unmount();
  });

  it("Shift+Tab cycles default → acceptEdits → plan → default", async () => {
    const ui = mount([]);
    await waitFor(ui, "izin sor");
    ui.stdin.write("\u001b[Z");
    await waitFor(ui, "düzenlemeleri kabul");
    ui.stdin.write("\u001b[Z");
    await waitFor(ui, "PLAN MODU");
    ui.stdin.write("\u001b[Z");
    await waitFor(ui, "izin sor");
    ui.unmount();
  });

  it("plan mode: writes are refused, the plan is shown, approval switches mode and unlocks edits", async () => {
    const engine = new PermissionEngine({ cwd, mode: "plan" });
    const provider = new MockProvider([
      { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "1" } }] },
      { toolCalls: [{ name: "ExitPlanMode", args: { plan: "1. a.txt yaz" } }] },
      { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "2" } }] },
      { text: "uygulandi" },
    ]);
    const ui = render(
      <App provider={provider} config={config} cwd={cwd} model="m" engine={engine} />,
    );
    await type(ui, "dosya yaz");
    await waitFor(ui, "Plan onayı");
    await waitFor(ui, "a.txt yaz");
    ui.stdin.write("y");
    await waitFor(ui, "uygulandi");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("2");
    expect(engine.mode).toBe("acceptEdits");
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain(
      "Plan mode: changes are not allowed",
    );
    // The system prompt (the cacheable prefix) never changes; plan mode rides on a trailing message.
    const systems = new Set(provider.requests.map((r) => JSON.stringify(r.messages[0])));
    expect(systems.size).toBe(1);
    const lastOf = (i: number) => String(provider.requests[i]?.messages.at(-1)?.content);
    expect(lastOf(0)).toContain("[plan mode]");
    expect(lastOf(3)).not.toContain("[plan mode]");
    const toolNames = (i: number) => provider.requests[i]?.tools?.map((t) => t.name) ?? [];
    expect(toolNames(0)).toContain("ExitPlanMode");
    expect(toolNames(3)).not.toContain("ExitPlanMode");
    ui.unmount();
  });

  it("/rewind restores files and cuts the conversation", async () => {
    await writeFile(join(cwd, "a.txt"), "orijinal");
    const { provider, ...ui } = mount(
      [
        { toolCalls: [{ name: "Write", args: { path: "a.txt", content: "degisti" } }] },
        { text: "yazdim" },
        { text: "sonra" },
      ],
      { engine: new PermissionEngine({ cwd, mode: "acceptEdits" }) },
    );
    await type(ui, "birinci");
    await waitFor(ui, "yazdim");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("degisti");
    await type(ui, "/rewind");
    await waitFor(ui, "1. birinci · 1 dosya");
    await type(ui, "/rewind 1");
    await waitFor(ui, "1 tur geri alındı");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("orijinal");
    await type(ui, "ikinci");
    await waitFor(ui, "sonra");
    const sent = JSON.stringify(provider.requests.at(-1)?.messages);
    expect(sent).toContain("ikinci");
    expect(sent).not.toContain("birinci");
    expect(sent).not.toContain("degisti");
    ui.unmount();
  });

  it("/permissions lists rules and /mode refuses bypass", async () => {
    const ui = mount([], { engine: new PermissionEngine({ cwd, deny: ["Read(.env)"] }) });
    await type(ui, "/permissions");
    await waitFor(ui, "deny: Read(.env)");
    await type(ui, "/mode bypass");
    await waitFor(ui, "yalnızca --yes");
    ui.unmount();
  });

  it("UserPromptSubmit hook can block a prompt before it reaches the model", async () => {
    const { HookRunner } = await import("@usta/core");
    const hooks = new HookRunner(
      { UserPromptSubmit: [{ command: "echo yasak konu >&2; exit 2" }] },
      cwd,
    );
    const provider = new MockProvider([{ text: "gelmemeli" }]);
    const ui = render(
      <App provider={provider} config={config} cwd={cwd} model="m" hooks={hooks} />,
    );
    await type(ui, "merhaba");
    await waitFor(ui, "Hook istemi engelledi: yasak konu");
    expect(provider.requests).toHaveLength(0);
    ui.unmount();
  });

  const offline = (async () => {
    throw new Error("offline");
  }) as typeof fetch;
  const economyFor = (provider: MockProvider, extra = {}) =>
    new Economy({
      config,
      provider,
      registry: new ModelRegistry(config, { home, fetchImpl: offline }),
      model: () => "m",
      quota: false,
      fetchImpl: offline,
      home,
      ...extra,
    });

  it("/cost reports usage and /context splits the window (estimated when the gateway cannot count)", async () => {
    const provider = new MockProvider([{ text: "cevap" }]);
    const ui = render(
      <App
        provider={provider}
        config={config}
        cwd={cwd}
        model="m"
        economy={economyFor(provider)}
      />,
    );
    await type(ui, "merhaba");
    await waitFor(ui, "cevap");
    await type(ui, "/cost");
    await waitFor(ui, "Bu oturum: 1 istek");
    await type(ui, "/context");
    await waitFor(ui, "Bağlam penceresi");
    await waitFor(ui, "tahmin");
    ui.unmount();
  });

  it("/compact summarizes older turns and the next request carries the summary", async () => {
    const provider = new MockProvider([
      { text: "a1" },
      { text: "a2" },
      { text: "a3" },
      { text: "OZET-METNI" },
      { text: "son" },
    ]);
    const ui = render(
      <App
        provider={provider}
        config={config}
        cwd={cwd}
        model="m"
        economy={economyFor(provider)}
      />,
    );
    for (const q of ["bir", "iki", "uc"]) {
      await type(ui, q);
      await waitFor(ui, `a${["bir", "iki", "uc"].indexOf(q) + 1}`);
    }
    await type(ui, "/compact");
    await waitFor(ui, "Bağlam özetlendi");
    await type(ui, "dort");
    await waitFor(ui, "son");
    const last = JSON.stringify(provider.requests.at(-1)?.messages);
    expect(last).toContain("OZET-METNI");
    expect(last).not.toContain('"bir"');
    expect(last).toContain("dort");
    ui.unmount();
  });

  it("asks before blowing the token budget and stops when declined", async () => {
    const provider = new MockProvider([{ text: "gelmemeli" }]);
    const ui = render(
      <App
        provider={provider}
        config={config}
        cwd={cwd}
        model="m"
        economy={economyFor(provider, { budget: { tokens: 5 } })}
      />,
    );
    await type(ui, "merhaba dunya");
    await waitFor(ui, "bütçesi (5) aşılacak");
    ui.stdin.write("n");
    await waitFor(ui, "Durduruldu");
    expect(provider.requests).toHaveLength(0);
    ui.unmount();
  });

  it("Script: the user approves the code, then the diff; only then are files changed (one tool call)", async () => {
    await writeFile(join(cwd, "a.txt"), "foo\n");
    const code =
      "import pathlib\np = pathlib.Path('a.txt'); p.write_text(p.read_text().replace('foo', 'bar'))";
    const provider = new MockProvider([
      { toolCalls: [{ name: "Script", args: { language: "python", code } }] },
      { text: "tamam" },
    ]);
    const ui = render(
      <App
        provider={provider}
        config={config}
        cwd={cwd}
        model="m"
        economy={economyFor(provider)}
      />,
    );
    await type(ui, "foo yerine bar");
    await waitFor(ui, "İzin gerekiyor: Script");
    await waitFor(ui, "import pathlib"); // the user sees the code before it runs
    ui.stdin.write("y");
    await waitFor(ui, "Betiğin değişiklikleri uygulansın mı?");
    await waitFor(ui, "+bar");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("foo\n"); // still untouched while reviewing
    ui.stdin.write("y");
    await waitFor(ui, "tamam");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("bar\n");
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain("Applied 1 files");
    ui.unmount();
  });

  it("declining the diff leaves the project untouched and tells the model", async () => {
    await writeFile(join(cwd, "a.txt"), "foo\n");
    const code = "import pathlib\np = pathlib.Path('a.txt'); p.write_text('changed')";
    const provider = new MockProvider([
      { toolCalls: [{ name: "Script", args: { language: "python", code } }] },
      { text: "tamam" },
    ]);
    const ui = render(
      <App
        provider={provider}
        config={config}
        cwd={cwd}
        model="m"
        economy={economyFor(provider)}
      />,
    );
    await type(ui, "degistir");
    await waitFor(ui, "İzin gerekiyor: Script");
    ui.stdin.write("y");
    await waitFor(ui, "Betiğin değişiklikleri uygulansın mı?");
    ui.stdin.write("n");
    await waitFor(ui, "tamam");
    expect(await readFile(join(cwd, "a.txt"), "utf8")).toBe("foo\n");
    expect(JSON.stringify(provider.requests[1]?.messages)).toContain("NOT applied");
    ui.unmount();
  });
});
