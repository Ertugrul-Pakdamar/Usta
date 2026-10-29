#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import {
  type AskRequest,
  acceptTerms,
  BulkEditNudge,
  buildSystemPrompt,
  builtinTools,
  composeAfterTool,
  configFromEnv,
  createAfterTool,
  createNudgeAfterTool,
  createReviewer,
  createTaskTools,
  createToolGate,
  fetchTerms,
  findSession,
  GatewayError,
  gatewayError,
  getLanguage,
  loadEnvFiles,
  loadSession,
  type Message,
  OpenAICompatibleProvider,
  PLAN_MODE_REMINDER,
  pruneOldOutputs,
  runAgent,
  runDoctor,
  type Session,
  serializeAsk,
  TaskManager,
  t,
  toolsForMode,
} from "@usta/core";
import { Command } from "commander";
import {
  askYesNo,
  createEconomy,
  initLanguage,
  loadSessionAgents,
  parseTokens,
  setupRuntime,
} from "./runtime.js";

loadEnvFiles();
pruneOldOutputs();
try {
  initLanguage();
} catch (err) {
  console.error(err instanceof GatewayError ? t("cli.error", { message: err.message }) : err);
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const program = new Command("usta")
  .description(t("cli.description"))
  .version(pkg.version, "-V, --version", t("cli.opt.version"))
  .helpOption("-h, --help", t("cli.opt.help"))
  .helpCommand("help [command]", t("cli.cmd.help"))
  .option("-p, --print <prompt>", t("cli.opt.print"))
  .option("--output-format <format>", t("cli.opt.outputFormat"), "text")
  .option("--model <model>", t("cli.opt.model"))
  .option("--max-turns <n>", t("cli.opt.maxTurns"), (v) => Number.parseInt(v, 10), 25)
  .option("-c, --continue", t("cli.opt.continue"))
  .option("-r, --resume [id]", t("cli.opt.resume"))
  .argument("[prompt...]", t("cli.arg.prompt"))
  .option("--permission-mode <mode>", t("cli.opt.permissionMode"))
  .option("--plan", t("cli.opt.plan"))
  .option("--allow <rule...>", t("cli.opt.allow"))
  .option("--deny <rule...>", t("cli.opt.deny"))
  .option("--trust-project", t("cli.opt.trustProject"))
  .option("--budget <cr>", t("cli.opt.budget"), (v) => Number.parseFloat(v))
  .option("--token-budget <n>", t("cli.opt.tokenBudget"), parseTokens)
  .option("-y, --yes", t("cli.opt.yes"))
  .option("--lang <lang>", t("cli.opt.lang"))
  .action(async (promptWords: string[], opts) => {
    if (opts.print) return runHeadless(opts);
    if (!process.stdin.isTTY || !process.stdout.isTTY) return program.help();
    await runInteractive(opts, promptWords.join(" ") || undefined);
  });

program
  .command("doctor")
  .description(t("cli.cmd.doctor"))
  .action(async () => {
    const checks = await runDoctor(configFromEnv());
    for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  });

const terms = program.command("terms").description(t("cli.cmd.terms"));

terms.action(async () => {
  const doc = await fetchTerms(configFromEnv());
  console.log(`${doc.content}\n\n${t("terms.footer", { version: doc.version })}`);
});

terms
  .command("accept")
  .description(t("cli.cmd.termsAccept"))
  .action(async () => {
    if (!process.stdin.isTTY) {
      throw gatewayError("error.termsNeedTerminal");
    }
    const config = configFromEnv();
    const doc = await fetchTerms(config);
    console.log(`${doc.content}\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const word = t("terms.confirmWord");
    const answer = await rl.question(t("terms.confirmPrompt", { version: doc.version, word }));
    rl.close();
    if (answer.trim().toLocaleLowerCase(getLanguage()) !== word.toLocaleLowerCase(getLanguage())) {
      console.log(t("terms.notConfirmed"));
      process.exitCode = 1;
      return;
    }
    await acceptTerms(config, doc.version);
    console.log(t("terms.accepted", { version: doc.version }));
  });

program
  .command("models")
  .description(t("cli.cmd.models"))
  .action(async () => {
    const provider = new OpenAICompatibleProvider(configFromEnv());
    console.log((await provider.listModels()).join("\n"));
  });

interface InteractiveOptions {
  model?: string;
  continue?: boolean;
  resume?: string | true;
  permissionMode?: string;
  plan?: boolean;
  yes?: boolean;
  allow?: string[];
  deny?: string[];
  trustProject?: boolean;
  budget?: number;
  tokenBudget?: number;
}

async function runInteractive(opts: InteractiveOptions, initialPrompt?: string): Promise<void> {
  const config = configFromEnv();
  const cwd = process.cwd();
  let resume: { session: Session; messages: Message[] } | undefined;
  if (opts.continue || opts.resume) {
    const found = findSession(cwd, typeof opts.resume === "string" ? opts.resume : undefined);
    if (!found) throw gatewayError("error.noSessionToResume");
    resume = loadSession(found.path);
  }
  const { engine, hooks, warnings, settings } = await setupRuntime(cwd, opts, true);
  const provider = new OpenAICompatibleProvider(config);
  const model = opts.model ?? resume?.session.meta.model ?? settings.models.main ?? config.model;
  const economy = await createEconomy({ config, provider, settings, flags: opts, model });
  const loadedAgents = await loadSessionAgents(cwd, opts, true);
  const { startTui } = await import("./tui/start.js");
  await startTui({
    provider,
    config,
    cwd,
    model,
    resume,
    initialPrompt,
    engine,
    hooks,
    economy,
    agents: loadedAgents.agents,
    warnings: [...warnings, ...loadedAgents.warnings],
    version: `v${pkg.version}`,
  });
}

interface HeadlessOptions extends InteractiveOptions {
  print: string;
  outputFormat: string;
  maxTurns: number;
}

async function runHeadless(opts: HeadlessOptions): Promise<void> {
  const config = configFromEnv();
  const cwd = process.cwd();
  const json = opts.outputFormat === "json";
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());

  const interactive = Boolean(process.stdin.isTTY);
  const { engine, hooks, warnings, settings } = await setupRuntime(cwd, opts, interactive);
  for (const w of warnings) console.error(`⚠ ${w}`);
  const warn = (text: string) => console.error(`⚠ ${text}`);

  const provider = new OpenAICompatibleProvider(config);
  const model = opts.model ?? settings.models.main ?? config.model;
  const economy = await createEconomy({ config, provider, settings, flags: opts, model });
  const headlessId = `headless-${Date.now().toString(36)}`;
  economy.setSession(headlessId);
  economy.callbacks = {
    onWarning: warn,
    askBudget: interactive ? (m) => askYesNo(m) : undefined,
    onCompact: (r) =>
      warn(
        t("cli.compacted", {
          before: t("unit.messages", { count: r.before }),
          after: t("unit.messages", { count: r.messages.length }),
        }),
      ),
  };
  await economy.refreshQuota();

  const ask = interactive
    ? async (req: AskRequest) => {
        if (req.kind === "plan") {
          console.error(`\n${req.plan}\n`);
          const ok = await askYesNo(t("cli.planPrompt"));
          return { allow: ok, mode: ok ? ("acceptEdits" as const) : undefined };
        }
        if (req.diff) console.error(req.diff);
        const what =
          req.kind === "review"
            ? t("cli.reviewPrompt")
            : t("cli.runPrompt", {
                call: `${req.tool.name} ${JSON.stringify(req.input).slice(0, 200)}`,
              });
        const who = req.agent ? `[${req.agent}] ` : "";
        return { allow: await askYesNo(`${who}${what}${req.reason ? ` (${req.reason})` : ""}`) };
      }
    : undefined;
  // Subagents may ask too; their questions are answered one at a time.
  const askSerial = ask ? serializeAsk(ask) : undefined;

  const loadedAgents = await loadSessionAgents(cwd, opts, interactive);
  for (const w of loadedAgents.warnings) warn(w);
  const manager = new TaskManager({
    agents: () => loadedAgents.agents,
    allowBackground: false, // nobody is around to receive a notice: run in the foreground
    runtime: {
      provider,
      cwd,
      engine,
      economy,
      tools: () => builtinTools,
      hooks,
      ask: askSerial,
      onWarning: warn,
      logDir: () => join(homedir(), ".usta", "subagents", headlessId),
    },
  });
  const allTools = [...builtinTools, ...createTaskTools(manager, loadedAgents.agents)];

  const start = await hooks.run("SessionStart");
  const submit = await hooks.run("UserPromptSubmit", { prompt: opts.print });
  for (const w of [...start.warnings, ...submit.warnings]) warn(w);
  if (submit.blocked) {
    throw new GatewayError(t("tui.hookBlockedPrompt", { reason: submit.blocked.reason }));
  }
  const context = [...start.context, ...submit.context];
  const prompt = context.length
    ? `${opts.print}\n\n<hook-context>\n${context.join("\n")}\n</hook-context>`
    : opts.print;

  const result = await runAgent(prompt, {
    provider,
    model: economy.modelId,
    tools: () => toolsForMode(allTools, engine.mode),
    cwd,
    system: buildSystemPrompt(cwd),
    volatileTail: () => (engine.mode === "plan" ? PLAN_MODE_REMINDER : undefined),
    maxTokens: config.maxTokens,
    maxTurns: opts.maxTurns,
    signal: abort.signal,
    approve: createToolGate({ engine, hooks, onWarning: warn, ask: askSerial }),
    review: createReviewer({ engine, ask: askSerial }),
    afterTool: composeAfterTool(
      createAfterTool(hooks, undefined, warn),
      createNudgeAfterTool(new BulkEditNudge()),
    ),
    beforeRequest: economy.beforeRequest,
    limitOutput: economy.limitOutput,
    state: economy.state,
    onEvent: (ev) => {
      if (ev.type === "text" && !json) process.stdout.write(ev.delta);
      if (ev.type === "usage") economy.recordUsage(ev.usage, ev.sentMessages);
      if (ev.type === "tool_start")
        console.error(`⏺ ${ev.call.name} ${ev.call.arguments.slice(0, 120)}`);
      if (ev.type === "tool_result" && ev.isError)
        console.error(`  ✗ ${(ev.display ?? ev.output).split("\n")[0]}`);
    },
  });
  if (result.stopReason === "end_turn") for (const w of (await hooks.run("Stop")).warnings) warn(w);
  await economy.refreshQuota();

  const tracker = economy.tracker;
  if (json) {
    console.log(
      JSON.stringify({
        result: result.text,
        turns: result.turns,
        stop_reason: result.stopReason,
        ...(result.stopDetail && { stop_detail: result.stopDetail }),
        usage: {
          prompt_tokens: result.usage.promptTokens,
          completion_tokens: result.usage.completionTokens,
          cached_tokens: result.usage.cachedTokens ?? 0,
          cache_ratio: Number(tracker.cacheRatio.toFixed(3)),
        },
        // Whole session, subagents included (`usage` above is the main conversation only).
        session_usage: {
          requests: tracker.requests,
          prompt_tokens: tracker.promptTokens,
          completion_tokens: tracker.completionTokens,
        },
        ...(tracker.spentCr !== undefined && { spent_cr: tracker.spentCr }),
        ...(tracker.quota?.remainingCr !== undefined && {
          remaining_cr: tracker.quota.remainingCr,
        }),
      }),
    );
  } else {
    process.stdout.write("\n");
    if (result.stopReason === "budget")
      console.error(t("cli.stopped", { detail: result.stopDetail ?? "" }));
  }
  if (result.stopReason === "budget") process.exitCode = 3;
  else if (result.stopReason !== "end_turn") process.exitCode = 2;
}

try {
  await program.parseAsync();
} catch (err) {
  console.error(err instanceof GatewayError ? t("cli.error", { message: err.message }) : err);
  process.exitCode = 1;
}
