import { PERMISSION_MODES, type PermissionMode } from "@usta/core";

export interface SlashContext {
  model: string;
  sessionId: string | undefined;
  info(text: string): void;
  setModel(model: string): void;
  clear(): void;
  exit(): void;
  listModels(): Promise<string[]>;
  costReport(): string;
  /** Where the context window goes (system / tools / messages / free). */
  contextReport(): Promise<string>;
  /** Summarizes older turns now; `instruction` says what to keep in focus. */
  compact(instruction?: string): Promise<void>;
  mode: PermissionMode;
  setMode(mode: PermissionMode): void;
  /** Human-readable rules, hooks and settings files in effect. */
  describePermissions(): string;
  /** Recent turns that /rewind can undo, newest first. */
  rewindList(): string;
  rewind(turns: number): void;
}

export interface SlashCommand {
  name: string;
  description: string;
  run(args: string, ctx: SlashContext): void | Promise<void>;
}

export function parseSlash(input: string): { name: string; args: string } | undefined {
  const m = /^\/(\S+)\s*(.*)$/s.exec(input.trim());
  return m ? { name: m[1] as string, args: (m[2] ?? "").trim() } : undefined;
}

export const slashCommands: SlashCommand[] = [
  {
    name: "help",
    description: "Komutları ve kısayolları listeler",
    run: (_, ctx) =>
      ctx.info(
        [
          ...slashCommands.map((c) => `/${c.name.padEnd(8)} ${c.description}`),
          "",
          "!komut     Doğrudan shell komutu çalıştırır (modele gitmez)",
          "Enter gönder · satır sonuna \\ koyup Enter = yeni satır · ↑/↓ geçmiş",
          "Esc çalışan işi iptal eder · Ctrl+C iptal / çıkış",
        ].join("\n"),
      ),
  },
  {
    name: "clear",
    description: "Yeni bir konuşma (ve yeni oturum) başlatır",
    run: (_, ctx) => ctx.clear(),
  },
  {
    name: "model",
    description: "Modeli gösterir veya değiştirir: /model <ad>",
    run(args, ctx) {
      if (!args) return ctx.info(`Model: ${ctx.model}`);
      ctx.setModel(args);
      ctx.info(`Model değişti: ${args}`);
    },
  },
  {
    name: "models",
    description: "Gateway'deki modelleri listeler",
    async run(_, ctx) {
      const models = await ctx.listModels();
      ctx.info(models.map((m) => `${m === ctx.model ? "●" : " "} ${m}`).join("\n") || "Model yok.");
    },
  },
  {
    name: "cost",
    description: "Token kullanımı, önbellek, kalan kredi ve bütçe",
    run: (_, ctx) => ctx.info(ctx.costReport()),
  },
  {
    name: "context",
    description: "Bağlam penceresinin neye gittiğini gösterir",
    run: async (_, ctx) => ctx.info(await ctx.contextReport()),
  },
  {
    name: "compact",
    description: "Eski turları özetleyip bağlamı küçültür: /compact [neye odaklanılsın]",
    run: (args, ctx) => ctx.compact(args || undefined),
  },
  {
    name: "session",
    description: "Oturum kimliğini gösterir (devam: usta --resume <id>)",
    run: (_, ctx) => ctx.info(ctx.sessionId ? `Oturum: ${ctx.sessionId}` : "Henüz oturum yok."),
  },
  {
    name: "mode",
    description: `İzin modunu gösterir/değiştirir: /mode <${PERMISSION_MODES.filter((m) => m !== "bypass").join("|")}>`,
    run(args, ctx) {
      if (!args) return ctx.info(`İzin modu: ${ctx.mode} (değiştirmek için ⇧Tab veya /mode <ad>)`);
      if (args === "bypass" || !(PERMISSION_MODES as readonly string[]).includes(args)) {
        return ctx.info(
          args === "bypass"
            ? "bypass yalnızca --yes / --permission-mode bypass ile başlatılırken açılabilir."
            : `Bilinmeyen mod: ${args}`,
        );
      }
      ctx.setMode(args as PermissionMode);
      ctx.info(`İzin modu: ${args}`);
    },
  },
  {
    name: "plan",
    description: "Plan moduna geçer (salt okuma; plan onayına kadar değişiklik yok)",
    run(_, ctx) {
      ctx.setMode("plan");
      ctx.info("Plan modu açık. Hedefinizi yazın; model araştırıp bir plan sunacak.");
    },
  },
  {
    name: "permissions",
    description: "Geçerli izin kurallarını, hook'ları ve ayar dosyalarını gösterir",
    run: (_, ctx) => ctx.info(ctx.describePermissions()),
  },
  {
    name: "rewind",
    description: "Son turların dosya değişikliklerini ve konuşmayı geri alır: /rewind <tur sayısı>",
    run(args, ctx) {
      const n = Number.parseInt(args, 10);
      if (Number.isInteger(n) && n > 0) return ctx.rewind(n);
      ctx.info(ctx.rewindList());
    },
  },
  { name: "exit", description: "Çıkar", run: (_, ctx) => ctx.exit() },
];
