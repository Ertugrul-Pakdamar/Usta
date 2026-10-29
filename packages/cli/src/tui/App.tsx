import {
  type AskAnswer,
  type AskRequest,
  appendCompaction,
  appendMessage,
  BulkEditNudge,
  bashTool,
  buildSystemPrompt,
  builtinTools,
  CheckpointStore,
  type CompactResult,
  composeAfterTool,
  createAfterTool,
  createNudgeAfterTool,
  createReviewer,
  createSession,
  createToolGate,
  Economy,
  HookRunner,
  type Message,
  ModelRegistry,
  PermissionEngine,
  type PermissionMode,
  PLAN_MODE_REMINDER,
  type Provider,
  runAgent,
  type Session,
  toolsForMode,
  toToolSpec,
  truncateSession,
  type UstaConfig,
} from "@usta/core";
import type { Tool } from "@usta/sdk";
import { Box, Static, Text, useApp, useInput, useStdout } from "ink";
import { useEffect, useRef, useState } from "react";
import { parseSlash, slashCommands } from "../slash.js";
import { Approval } from "./Approval.js";
import { Confirm } from "./Confirm.js";
import { formatContextReport, formatCostReport, summarizeCall, summarizeOutput } from "./format.js";
import { Spinner } from "./Spinner.js";
import { StatusBar } from "./StatusBar.js";
import { TextInput } from "./TextInput.js";
import { type Item, ItemView } from "./Transcript.js";

export interface AppProps {
  provider: Provider;
  config: UstaConfig;
  cwd: string;
  model: string;
  /** Permission rules and mode. Defaults to an engine in `default` mode with no rules. */
  engine?: PermissionEngine;
  hooks?: HookRunner;
  /** Token/cost/context management. Defaults to one without quota calls or budgets. */
  economy?: Economy;
  /** Problems found while loading settings; shown once at startup. */
  warnings?: string[];
  /** Existing transcript when resuming. */
  resume?: { session: Session; messages: Message[] };
  initialPrompt?: string;
  tools?: Tool<any>[];
  /** CLI version shown in the banner. */
  version?: string;
}

interface PendingAsk {
  request: AskRequest;
  resolve(answer: AskAnswer): void;
}

interface PendingConfirm {
  message: string;
  resolve(ok: boolean): void;
}

type NewItem = Item extends infer I ? (I extends { id: number } ? Omit<I, "id"> : never) : never;

const MODE_CYCLE: PermissionMode[] = ["default", "acceptEdits", "plan"];

function historyItems(messages: Message[]): NewItem[] {
  const out: NewItem[] = [];
  for (const m of messages) {
    if (m.role === "user") out.push({ kind: "user", text: m.content });
    else if (m.role === "assistant" && m.content) out.push({ kind: "assistant", text: m.content });
  }
  return out;
}

export function App(props: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const width = (stdout as { columns?: number } | undefined)?.columns ?? 80;
  const tools = props.tools ?? builtinTools;

  const [engine] = useState(() => props.engine ?? new PermissionEngine({ cwd: props.cwd }));
  const [hooks] = useState(() => props.hooks ?? new HookRunner({}, props.cwd));
  const [economy] = useState(
    () =>
      props.economy ??
      new Economy({
        config: props.config,
        provider: props.provider,
        registry: new ModelRegistry(props.config),
        model: () => props.model,
        quota: false,
      }),
  );
  // Stable for the whole session so the gateway can cache the prompt prefix.
  const [systemPrompt] = useState(() => buildSystemPrompt(props.cwd));

  const nextId = useRef(0);
  const [items, setItems] = useState<Item[]>(() => {
    const first: NewItem[] = [
      { kind: "banner", text: `${props.version ?? ""} · ${props.model} · ${props.cwd}` },
      ...(props.warnings ?? []).map((text): NewItem => ({ kind: "info", text: `⚠ ${text}` })),
      ...(props.resume
        ? [
            {
              kind: "info",
              text: `Oturum devam ediyor: ${props.resume.session.meta.id}`,
            } as NewItem,
            ...historyItems(props.resume.messages),
          ]
        : []),
    ];
    return first.map((it) => ({ ...it, id: nextId.current++ }) as Item);
  });
  const [streaming, setStreaming] = useState("");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [model, setModelState] = useState(props.model);
  const [mode, setModeState] = useState<PermissionMode>(engine.mode);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);

  const messages = useRef<Message[]>(props.resume?.messages ?? []);
  const session = useRef<Session | undefined>(props.resume?.session);
  const checkpoints = useRef<CheckpointStore | undefined>(undefined);
  const streamBuf = useRef("");
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abort = useRef<AbortController | undefined>(undefined);
  const previews = useRef(new Map<string, string>());
  const lastCtrlC = useRef(0);
  const started = useRef(false);
  const sessionStarted = useRef(false);

  const addItem = (item: NewItem) =>
    setItems((prev) => [...prev, { ...item, id: nextId.current++ } as Item]);
  const info = (text: string) => addItem({ kind: "info", text });

  useEffect(() => engine.onModeChange(setModeState), [engine]);
  useEffect(() => {
    economy.setSession(session.current?.meta.id);
    void economy.refreshQuota().then(bump);
  }, [economy]);

  const handleCompact = (r: CompactResult) => {
    messages.current = r.messages;
    if (session.current) appendCompaction(session.current, r.summary, r.keepFrom);
    checkpoints.current?.shiftAfterCompaction(r.keepFrom);
    info(`Bağlam özetlendi: ${r.before} mesaj → ${r.messages.length}.`);
  };
  economy.callbacks = {
    onWarning: (text) => info(`⚠ ${text}`),
    askBudget: (message) => new Promise<boolean>((resolve) => setConfirm({ message, resolve })),
    onCompact: handleCompact,
  };

  const flushStream = (final: boolean) => {
    clearTimeout(flushTimer.current);
    flushTimer.current = undefined;
    if (!final) return setStreaming(streamBuf.current);
    const text = streamBuf.current.trim();
    streamBuf.current = "";
    setStreaming("");
    if (text) addItem({ kind: "assistant", text });
  };

  const answer = (a: AskAnswer) => {
    setPending((cur) => {
      cur?.resolve(a);
      return null;
    });
  };
  const settleConfirm = (ok: boolean) => {
    setConfirm((cur) => {
      cur?.resolve(ok);
      return null;
    });
  };

  const [gate] = useState(() =>
    createToolGate({
      engine,
      hooks,
      checkpoints: () => checkpoints.current,
      sessionId: () => session.current?.meta.id,
      ask: (request) => new Promise<AskAnswer>((resolve) => setPending({ request, resolve })),
      onWarning: (text) => info(`⚠ ${text}`),
      onPreview: (id, diff) => previews.current.set(id, diff),
    }),
  );
  const [review] = useState(() =>
    createReviewer({
      engine,
      checkpoints: () => checkpoints.current,
      ask: (request) => new Promise<AskAnswer>((resolve) => setPending({ request, resolve })),
    }),
  );
  const [hookAfterTool] = useState(() =>
    createAfterTool(
      hooks,
      () => session.current?.meta.id,
      (text) => info(`⚠ ${text}`),
    ),
  );

  const ensureSession = (): Session => {
    if (!session.current) {
      session.current = createSession(props.cwd, economy.modelId);
      economy.setSession(session.current.meta.id);
      bump();
    }
    checkpoints.current ??= CheckpointStore.open(session.current.meta.id);
    return session.current;
  };

  const runTurn = async (text: string) => {
    const sess = ensureSession();
    const store = checkpoints.current as CheckpointStore;

    const context: string[] = [];
    if (!sessionStarted.current) {
      sessionStarted.current = true;
      const start = await hooks.run("SessionStart", { sessionId: sess.meta.id });
      context.push(...start.context);
      for (const w of start.warnings) info(`⚠ ${w}`);
    }
    const submit = await hooks.run("UserPromptSubmit", { sessionId: sess.meta.id, prompt: text });
    for (const w of submit.warnings) info(`⚠ ${w}`);
    if (submit.blocked) {
      addItem({ kind: "user", text });
      return addItem({ kind: "error", text: `Hook istemi engelledi: ${submit.blocked.reason}` });
    }
    context.push(...submit.context);

    store.beginTurn(messages.current.length, text);
    const content = context.length
      ? `${text}\n\n<hook-context>\n${context.join("\n")}\n</hook-context>`
      : text;
    const userMsg: Message = { role: "user", content };
    messages.current.push(userMsg);
    appendMessage(sess, userMsg);
    addItem({ kind: "user", text });

    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const result = await runAgent([...messages.current], {
        provider: props.provider,
        model: economy.modelId,
        tools: () => toolsForMode(tools, engine.mode),
        cwd: props.cwd,
        system: systemPrompt,
        volatileTail: () => (engine.mode === "plan" ? PLAN_MODE_REMINDER : undefined),
        maxTokens: props.config.maxTokens,
        maxTurns: 50,
        signal: ctl.signal,
        approve: gate,
        review,
        afterTool: composeAfterTool(hookAfterTool, createNudgeAfterTool(new BulkEditNudge())),
        beforeRequest: economy.beforeRequest,
        limitOutput: economy.limitOutput,
        state: economy.state,
        onMessage: (m) => {
          messages.current.push(m);
          appendMessage(sess, m);
        },
        onEvent: (ev) => {
          if (ev.type === "text") {
            streamBuf.current += ev.delta;
            flushTimer.current ??= setTimeout(() => flushStream(false), 50);
          } else if (ev.type === "usage") {
            economy.recordUsage(ev.usage, ev.sentMessages);
            bump();
          } else if (ev.type === "tool_start") {
            flushStream(true);
            setRunning((r) => ({
              ...r,
              [ev.call.id]: summarizeCall(ev.call.name, ev.call.arguments),
            }));
          } else if (ev.type === "tool_result") {
            setRunning(({ [ev.call.id]: _, ...rest }) => rest);
            const diff = previews.current.get(ev.call.id);
            previews.current.delete(ev.call.id);
            addItem({
              kind: "tool",
              summary: summarizeCall(ev.call.name, ev.call.arguments),
              output: summarizeOutput(ev.output),
              isError: ev.isError,
              diff: ev.isError ? undefined : diff,
            });
          }
        },
      });
      flushStream(true);
      if (result.stopReason === "aborted") info("İptal edildi.");
      if (result.stopReason === "max_turns") info("Tur sınırına ulaşıldı; devam etmek için yazın.");
      if (result.stopReason === "budget") info(`Durduruldu: ${result.stopDetail}`);
      if (result.stopReason === "end_turn") {
        const stop = await hooks.run("Stop", { sessionId: sess.meta.id });
        for (const w of stop.warnings) info(`⚠ ${w}`);
      }
    } catch (err) {
      flushStream(true);
      addItem({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
      setRunning({});
      answer({ allow: false });
      settleConfirm(false);
      abort.current = undefined;
      void economy.refreshQuota().then(bump);
    }
  };

  const runShell = async (command: string) => {
    if (!command) return;
    addItem({ kind: "user", text: `!${command}` });
    setBusy(true);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      info(await bashTool.run({ command }, { cwd: props.cwd, signal: ctl.signal }));
    } finally {
      setBusy(false);
      abort.current = undefined;
    }
  };

  const rewindList = () => {
    const turns = checkpoints.current?.list() ?? [];
    if (!turns.length) return "Geri alınacak tur yok.";
    const lines = [...turns]
      .reverse()
      .slice(0, 10)
      .map(
        (t, i) =>
          `${String(i + 1).padStart(2)}. ${t.prompt}${t.files.length ? ` · ${t.files.length} dosya` : ""}`,
      );
    return `Geri alınabilir turlar (en yeni üstte). Son N turu geri almak için /rewind N:\n${lines.join("\n")}\nNot: Bash ile yapılan dosya değişiklikleri izlenmez.`;
  };

  const rewind = (n: number) => {
    const store = checkpoints.current;
    const sess = session.current;
    if (busy || !store || !sess)
      return info(busy ? "Çalışırken geri alınamaz." : "Geri alınacak tur yok.");
    const r = store.rewind(n);
    if (!r) return info("Geri alınacak tur yok.");
    messages.current.length = Math.min(messages.current.length, r.messageCount);
    truncateSession(sess, r.messageCount);
    economy.invalidate();
    info(
      `${r.turns.length} tur geri alındı · ${r.restored.length} dosya geri yüklendi · ${r.deleted.length} dosya silindi (konuşma da o noktaya döndü).`,
    );
  };

  const compact = async (instruction?: string) => {
    if (busy) return info("Çalışırken özetlenemez.");
    info("Bağlam özetleniyor…");
    setBusy(true);
    try {
      if (!(await economy.compactNow(messages.current, instruction))) {
        info("Özetlenecek kadar eski konuşma yok.");
      }
    } catch (err) {
      addItem({
        kind: "error",
        text: `Özetlenemedi: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusy(false);
    }
  };

  const runSlash = async (text: string) => {
    const parsed = parseSlash(text);
    const cmd = slashCommands.find(
      (c) => c.name === parsed?.name || (parsed?.name === "quit" && c.name === "exit"),
    );
    if (!parsed || !cmd) return info(`Bilinmeyen komut: ${text}. /help yazın.`);
    try {
      await cmd.run(parsed.args, {
        model,
        sessionId: session.current?.meta.id,
        info,
        setModel: (m) => {
          setModelState(m);
          economy.setModel(m);
        },
        exit,
        mode,
        setMode: (m) => engine.setMode(m),
        describePermissions: () => describe(engine, hooks),
        rewindList,
        rewind,
        costReport: () => formatCostReport(economy),
        contextReport: async () =>
          formatContextReport(
            await economy.report(
              systemPrompt,
              messages.current,
              toolsForMode(tools, engine.mode).map(toToolSpec),
            ),
            economy.modelId,
            economy.compactAt,
          ),
        compact,
        clear: () => {
          messages.current = [];
          session.current = undefined;
          checkpoints.current = undefined;
          sessionStarted.current = false;
          economy.reset();
          economy.setSession(undefined);
          bump();
          setItems([{ kind: "banner", text: `yeni konuşma · ${model}`, id: nextId.current++ }]);
        },
        listModels: async () => (await props.provider.listModels?.()) ?? [],
      });
    } catch (err) {
      addItem({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const submit = (raw: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setHistory((h) => [...h, text]);
    if (text.startsWith("/")) void runSlash(text);
    else if (text.startsWith("!")) void runShell(text.slice(1).trim());
    else void runTurn(text);
  };

  if (props.initialPrompt && !started.current) {
    started.current = true;
    queueMicrotask(() => submit(props.initialPrompt as string));
  }

  useInput((char, key) => {
    if (key.ctrl && char === "c") {
      if (busy) {
        abort.current?.abort();
        answer({ allow: false });
        settleConfirm(false);
      } else if (Date.now() - lastCtrlC.current < 1500 || !input) {
        exit();
      } else {
        lastCtrlC.current = Date.now();
        info("Çıkmak için Ctrl+C'ye tekrar basın.");
      }
      return;
    }
    if (confirm) {
      if (char === "y" || char === "Y" || key.return) settleConfirm(true);
      else if (char === "n" || char === "N" || key.escape) settleConfirm(false);
      return;
    }
    if (pending) {
      const plan = pending.request.kind === "plan";
      if (char === "y" || char === "Y" || key.return) {
        answer(plan ? { allow: true, mode: "acceptEdits" } : { allow: true });
      } else if (plan && (char === "e" || char === "E")) {
        answer({ allow: true, mode: "default" });
      } else if (pending.request.kind === "tool" && (char === "a" || char === "A")) {
        answer({ allow: true, remember: true });
      } else if (char === "n" || char === "N" || key.escape) {
        answer({ allow: false });
      }
      return;
    }
    if (key.tab && key.shift) {
      const i = MODE_CYCLE.indexOf(engine.mode);
      engine.setMode(MODE_CYCLE[(i + 1) % MODE_CYCLE.length] as PermissionMode);
      return;
    }
    if (key.escape && busy) abort.current?.abort();
  });

  const suggestions =
    input.startsWith("/") && !input.includes(" ")
      ? slashCommands.filter((c) => c.name.startsWith(input.slice(1)))
      : [];
  const streamTail = streaming.split("\n").slice(-20).join("\n");
  const t = economy.tracker;

  return (
    <>
      <Static items={items}>
        {(item) => <ItemView key={item.id} item={item} width={width} />}
      </Static>
      {streamTail && (
        <Box marginTop={1}>
          <Box flexShrink={0}>
            <Text color="magenta">● </Text>
          </Box>
          <Text>{streamTail}</Text>
        </Box>
      )}
      {Object.entries(running).map(([id, summary]) => (
        <Text key={id} dimColor>
          ⏺ {summary} çalışıyor…
        </Text>
      ))}
      {pending && <Approval request={pending.request} width={width} />}
      {confirm && <Confirm message={confirm.message} />}
      {busy && !pending && !confirm && <Spinner label={streaming ? "Yazıyor" : "Düşünüyor"} />}
      <Box
        borderStyle="round"
        borderColor={busy ? "gray" : mode === "plan" ? "yellow" : "cyan"}
        paddingX={1}
        marginTop={1}
      >
        <TextInput isActive={!busy} history={history} onChange={setInput} onSubmit={submit} />
      </Box>
      {suggestions.map((c) => (
        <Text key={c.name} dimColor>
          {"  "}/{c.name.padEnd(11)} {c.description}
        </Text>
      ))}
      <StatusBar
        model={model}
        mode={mode}
        promptTokens={t.promptTokens}
        completionTokens={t.completionTokens}
        contextRatio={economy.usageRatio()}
        cacheRatio={t.cacheRatio}
        remainingCr={t.quota?.remainingCr}
        free={economy.model.promptPrice === 0 && economy.model.completionPrice === 0}
        sessionId={session.current?.meta.id}
      />
    </>
  );
}

function describe(engine: PermissionEngine, hooks: HookRunner): string {
  const r = engine.listRules();
  const list = (title: string, rules: string[]) =>
    `${title}: ${rules.length ? rules.join(", ") : "—"}`;
  return [
    `Mod: ${engine.mode}`,
    list("deny", r.deny),
    list("ask", r.ask),
    list("allow", r.allow),
    `Hook'lar: ${(["PreToolUse", "PostToolUse", "UserPromptSubmit", "SessionStart", "Stop"] as const).filter((e) => hooks.has(e)).join(", ") || "—"}`,
  ].join("\n");
}
