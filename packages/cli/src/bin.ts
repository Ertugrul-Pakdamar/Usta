#!/usr/bin/env node
import { readFileSync } from "node:fs";
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
  createToolGate,
  fetchTerms,
  findSession,
  GatewayError,
  loadEnvFiles,
  loadSession,
  type Message,
  OpenAICompatibleProvider,
  PLAN_MODE_REMINDER,
  pruneOldOutputs,
  runAgent,
  runDoctor,
  type Session,
  toolsForMode,
} from "@usta/core";
import { Command } from "commander";
import { askYesNo, createEconomy, parseTokens, setupRuntime } from "./runtime.js";

loadEnvFiles();
pruneOldOutputs();

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

const program = new Command("usta")
  .description("EVREN modelleri için ajan tabanlı kodlama CLI'ı")
  .version(pkg.version)
  .option("-p, --print <prompt>", "istemi çalıştır, sonucu yazdır ve çık (headless)")
  .option("--output-format <format>", "text | json", "text")
  .option("--model <model>", "kullanılacak model")
  .option("--max-turns <n>", "en fazla ajan turu", (v) => Number.parseInt(v, 10), 25)
  .option("-c, --continue", "bu dizindeki son oturuma devam et")
  .option("-r, --resume [id]", "belirli bir oturuma (veya sonuncusuna) devam et")
  .argument("[prompt...]", "etkileşimli oturumu bu istemle başlat")
  .option("--permission-mode <mode>", "default | acceptEdits | plan | bypass")
  .option("--plan", "plan modunda başla (salt okuma; plan onayına kadar değişiklik yok)")
  .option("--allow <rule...>", "izin kuralı ekle, ör. 'Bash(git status:*)'")
  .option("--deny <rule...>", "yasak kuralı ekle, ör. 'Read(.env)'")
  .option("--trust-project", "repodaki .usta/settings.json dosyasına sormadan güven")
  .option("--budget <cr>", "oturum için kredi (CR) bütçesi", (v) => Number.parseFloat(v))
  .option("--token-budget <n>", "oturum için toplam token bütçesi (örn. 200k)", parseTokens)
  .option("-y, --yes", "bypass modu: deny kuralları dışında her şeye izin ver (dikkat)")
  .action(async (promptWords: string[], opts) => {
    if (opts.print) return runHeadless(opts);
    if (!process.stdin.isTTY || !process.stdout.isTTY) return program.help();
    await runInteractive(opts, promptWords.join(" ") || undefined);
  });

program
  .command("doctor")
  .description("Bağlantı, anahtar ve şart kabul durumunu kontrol eder")
  .action(async () => {
    const checks = await runDoctor(configFromEnv());
    for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
    if (checks.some((c) => !c.ok)) process.exitCode = 1;
  });

const terms = program
  .command("terms")
  .description("Gateway kullanım şartlarını gösterir; `terms accept` ile kabul edilir");

terms.action(async () => {
  const t = await fetchTerms(configFromEnv());
  console.log(`${t.content}\n\nŞart sürümü: v${t.version}. Kabul etmek için: usta terms accept`);
});

terms
  .command("accept")
  .description("Şartları okuyup açıkça onaylayarak kabul eder (etkileşimli terminal gerekir)")
  .action(async () => {
    if (!process.stdin.isTTY) {
      throw new GatewayError(
        "Şartlar yalnızca etkileşimli bir terminalde, sizin onayınızla kabul edilebilir.",
      );
    }
    const config = configFromEnv();
    const t = await fetchTerms(config);
    console.log(`${t.content}\n`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(
      `Yukarıdaki v${t.version} şartlarını okudum ve kabul ediyorum. Onaylamak için "kabul ediyorum" yazın: `,
    );
    rl.close();
    if (answer.trim().toLocaleLowerCase("tr") !== "kabul ediyorum") {
      console.log("Onaylanmadı; hiçbir değişiklik yapılmadı.");
      process.exitCode = 1;
      return;
    }
    await acceptTerms(config, t.version);
    console.log(`✓ Şartlar (v${t.version}) kabul edildi. Kontrol için: usta doctor`);
  });

program
  .command("models")
  .description("Gateway'deki modelleri listeler")
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
    if (!found) throw new GatewayError("Devam edilecek oturum bulunamadı.");
    resume = loadSession(found.path);
  }
  const { engine, hooks, warnings, settings } = await setupRuntime(cwd, opts, true);
  const provider = new OpenAICompatibleProvider(config);
  const model = opts.model ?? resume?.session.meta.model ?? settings.models.main ?? config.model;
  const economy = await createEconomy({ config, provider, settings, flags: opts, model });
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
    warnings,
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
  economy.setSession(`headless-${Date.now().toString(36)}`);
  economy.callbacks = {
    onWarning: warn,
    askBudget: interactive ? (m) => askYesNo(m) : undefined,
    onCompact: (r) => warn(`Bağlam özetlendi: ${r.before} mesaj → ${r.messages.length}.`),
  };
  await economy.refreshQuota();

  const ask = interactive
    ? async (req: AskRequest) => {
        if (req.kind === "plan") {
          console.error(`\n${req.plan}\n`);
          const ok = await askYesNo(
            "Planı onaylıyor musunuz? (onaylanırsa düzenlemeler otomatik kabul edilir)",
          );
          return { allow: ok, mode: ok ? ("acceptEdits" as const) : undefined };
        }
        if (req.diff) console.error(req.diff);
        const what =
          req.kind === "review"
            ? "Betiğin değişiklikleri uygulansın mı?"
            : `${req.tool.name} ${JSON.stringify(req.input).slice(0, 200)} çalıştırılsın mı?`;
        return { allow: await askYesNo(`${what}${req.reason ? ` (${req.reason})` : ""}`) };
      }
    : undefined;

  const start = await hooks.run("SessionStart");
  const submit = await hooks.run("UserPromptSubmit", { prompt: opts.print });
  for (const w of [...start.warnings, ...submit.warnings]) warn(w);
  if (submit.blocked) throw new GatewayError(`Hook istemi engelledi: ${submit.blocked.reason}`);
  const context = [...start.context, ...submit.context];
  const prompt = context.length
    ? `${opts.print}\n\n<hook-context>\n${context.join("\n")}\n</hook-context>`
    : opts.print;

  const result = await runAgent(prompt, {
    provider,
    model: economy.modelId,
    tools: () => toolsForMode(builtinTools, engine.mode),
    cwd,
    system: buildSystemPrompt(cwd),
    volatileTail: () => (engine.mode === "plan" ? PLAN_MODE_REMINDER : undefined),
    maxTokens: config.maxTokens,
    maxTurns: opts.maxTurns,
    signal: abort.signal,
    approve: createToolGate({ engine, hooks, onWarning: warn, ask }),
    review: createReviewer({ engine, ask }),
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
      if (ev.type === "tool_result" && ev.isError) console.error(`  ✗ ${ev.output.split("\n")[0]}`);
    },
  });
  if (result.stopReason === "end_turn") for (const w of (await hooks.run("Stop")).warnings) warn(w);
  await economy.refreshQuota();

  const t = economy.tracker;
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
          cache_ratio: Number(t.cacheRatio.toFixed(3)),
        },
        ...(t.spentCr !== undefined && { spent_cr: t.spentCr }),
        ...(t.quota?.remainingCr !== undefined && { remaining_cr: t.quota.remainingCr }),
      }),
    );
  } else {
    process.stdout.write("\n");
    if (result.stopReason === "budget") console.error(`Durduruldu: ${result.stopDetail}`);
  }
  if (result.stopReason === "budget") process.exitCode = 3;
  else if (result.stopReason !== "end_turn") process.exitCode = 2;
}

try {
  await program.parseAsync();
} catch (err) {
  console.error(err instanceof GatewayError ? `Hata: ${err.message}` : err);
  process.exitCode = 1;
}
