import {
  getLanguage,
  LANGUAGES,
  type Lang,
  type MessageKey,
  PERMISSION_MODES,
  type PermissionMode,
  parseLanguage,
  setLanguage,
  t,
} from "@usta/core";

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
  /** The latest auto-mode decisions and counts. */
  autoReport(): string;
  /** Recent turns that /rewind can undo, newest first. */
  rewindList(): string;
  rewind(turns: number): void;
  tasks: {
    report(): string;
    show(id: string): string;
    stop(id: string): string;
  };
}

export interface SlashCommand {
  name: string;
  /** Message key of the description; it is looked up when shown, so `/lang` takes effect at once. */
  description: MessageKey;
  descriptionParams?: () => Record<string, string>;
  run(args: string, ctx: SlashContext): void | Promise<void>;
}

export function parseSlash(input: string): { name: string; args: string } | undefined {
  const m = /^\/(\S+)\s*(.*)$/s.exec(input.trim());
  return m ? { name: m[1] as string, args: (m[2] ?? "").trim() } : undefined;
}

const settableModes = () => PERMISSION_MODES.filter((m) => m !== "bypass").join("|");
const languages = () => LANGUAGES.join("|");

/** The description of a command in the current language. */
export const describeCommand = (c: SlashCommand): string =>
  t(c.description, c.descriptionParams?.());

export const slashCommands: SlashCommand[] = [
  {
    name: "help",
    description: "slash.desc.help",
    run: (_, ctx) =>
      ctx.info(
        [
          ...slashCommands.map((c) => `/${c.name.padEnd(11)} ${describeCommand(c)}`),
          "",
          t("slash.help.shell"),
          t("slash.help.keys1"),
          t("slash.help.keys2"),
        ].join("\n"),
      ),
  },
  { name: "clear", description: "slash.desc.clear", run: (_, ctx) => ctx.clear() },
  {
    name: "model",
    description: "slash.desc.model",
    run(args, ctx) {
      if (!args) return ctx.info(t("slash.modelCurrent", { model: ctx.model }));
      ctx.setModel(args);
      ctx.info(t("slash.modelChanged", { model: args }));
    },
  },
  {
    name: "models",
    description: "slash.desc.models",
    async run(_, ctx) {
      const models = await ctx.listModels();
      ctx.info(
        models.map((m) => `${m === ctx.model ? "●" : " "} ${m}`).join("\n") || t("slash.noModels"),
      );
    },
  },
  { name: "cost", description: "slash.desc.cost", run: (_, ctx) => ctx.info(ctx.costReport()) },
  {
    name: "context",
    description: "slash.desc.context",
    run: async (_, ctx) => ctx.info(await ctx.contextReport()),
  },
  {
    name: "compact",
    description: "slash.desc.compact",
    run: (args, ctx) => ctx.compact(args || undefined),
  },
  {
    name: "session",
    description: "slash.desc.session",
    run: (_, ctx) =>
      ctx.info(ctx.sessionId ? t("slash.session", { id: ctx.sessionId }) : t("slash.noSession")),
  },
  {
    name: "mode",
    description: "slash.desc.mode",
    descriptionParams: () => ({ modes: settableModes() }),
    run(args, ctx) {
      if (!args) return ctx.info(t("slash.modeCurrent", { mode: ctx.mode }));
      if (args === "bypass") return ctx.info(t("slash.modeBypassOnly"));
      if (!(PERMISSION_MODES as readonly string[]).includes(args)) {
        return ctx.info(t("slash.modeUnknown", { mode: args }));
      }
      ctx.setMode(args as PermissionMode);
      ctx.info(t("slash.modeSet", { mode: args }));
    },
  },
  {
    name: "auto",
    description: "slash.desc.auto",
    run: (_, ctx) => ctx.info(ctx.autoReport()),
  },
  {
    name: "plan",
    description: "slash.desc.plan",
    run(_, ctx) {
      ctx.setMode("plan");
      ctx.info(t("slash.planOn"));
    },
  },
  {
    name: "permissions",
    description: "slash.desc.permissions",
    run: (_, ctx) => ctx.info(ctx.describePermissions()),
  },
  {
    name: "rewind",
    description: "slash.desc.rewind",
    run(args, ctx) {
      const n = Number.parseInt(args, 10);
      if (Number.isInteger(n) && n > 0) return ctx.rewind(n);
      ctx.info(ctx.rewindList());
    },
  },
  {
    name: "lang",
    description: "slash.desc.lang",
    descriptionParams: () => ({ languages: languages() }),
    run(args, ctx) {
      if (!args)
        return ctx.info(t("slash.langCurrent", { lang: getLanguage(), languages: languages() }));
      const lang: Lang | undefined = parseLanguage(args);
      if (!lang) return ctx.info(t("slash.langUnknown", { value: args, languages: languages() }));
      setLanguage(lang);
      ctx.info(t("slash.langSet", { lang }));
    },
  },
  {
    name: "tasks",
    description: "slash.desc.tasks",
    run(args, ctx) {
      const [sub, id] = args.split(/\s+/);
      if (!args) return ctx.info(ctx.tasks.report());
      if (sub === "show" && id) return ctx.info(ctx.tasks.show(id));
      if (sub === "stop" && id) return ctx.info(ctx.tasks.stop(id));
      ctx.info(t("tasks.usage"));
    },
  },
  { name: "exit", description: "slash.desc.exit", run: (_, ctx) => ctx.exit() },
];
