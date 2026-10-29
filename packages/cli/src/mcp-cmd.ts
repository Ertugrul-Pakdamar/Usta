import { t } from "@usta/core";
import {
  loadMcpConfig,
  McpManager,
  type McpServerConfig,
  removeUserServer,
  saveUserServer,
} from "@usta/mcp";
import type { Command } from "commander";

const HEAVY_TOKENS = 1500;

function pairs(values: string[] | undefined): Record<string, string> | undefined {
  if (!values?.length) return undefined;
  const out: Record<string, string> = {};
  for (const v of values) {
    const i = v.indexOf("=");
    if (i < 1) throw new Error(t("mcp.badPair", { value: v }));
    out[v.slice(0, i)] = v.slice(i + 1);
  }
  return out;
}

/** One line per server, plus a hint for servers whose tool list is expensive. */
export function formatMcpStatus(manager: McpManager): string[] {
  const lines: string[] = [];
  for (const s of manager.status) {
    lines.push(
      s.state === "connected"
        ? t("mcp.ok", { name: s.name, count: s.tools.length, tokens: s.approxTokens })
        : t("mcp.fail", { name: s.name, error: s.error ?? "" }),
    );
    for (const tool of s.tools) lines.push(`    ${tool}`);
    if (s.approxTokens > HEAVY_TOKENS) {
      lines.push(`  ⚠ ${t("mcp.heavy", { name: s.name, tokens: s.approxTokens })}`);
    }
  }
  return lines;
}

export function registerMcpCommands(program: Command): void {
  const mcp = program.command("mcp").description(t("cli.cmd.mcp"));

  mcp
    .command("add")
    .description(t("cli.cmd.mcpAdd"))
    .argument("<name>")
    .argument("[command...]")
    .option("--url <url>", t("cli.opt.mcpUrl"))
    .option("-e, --env <pair...>", t("cli.opt.mcpEnv"))
    .option("-H, --header <pair...>", t("cli.opt.mcpHeader"))
    .action((name: string, command: string[], opts) => {
      let config: McpServerConfig;
      if (opts.url) {
        config = { url: opts.url, ...(opts.header && { headers: pairs(opts.header) }) };
      } else if (command.length) {
        config = {
          command: command[0] as string,
          ...(command.length > 1 && { args: command.slice(1) }),
          ...(opts.env && { env: pairs(opts.env) }),
        };
      } else {
        throw new Error(t("mcp.addNeedsTarget"));
      }
      console.log(t("mcp.added", { name, file: saveUserServer(name, config) }));
    });

  mcp
    .command("list")
    .description(t("cli.cmd.mcpList"))
    .action(async () => {
      const config = loadMcpConfig(process.cwd(), undefined);
      for (const w of config.warnings) console.error(`⚠ ${w}`);
      if (!Object.keys(config.servers).length) return console.log(t("mcp.none"));
      const manager = new McpManager();
      await manager.connect(config.servers);
      console.log(formatMcpStatus(manager).join("\n"));
      await manager.close();
    });

  mcp
    .command("remove")
    .description(t("cli.cmd.mcpRemove"))
    .argument("<name>")
    .action((name: string) => {
      console.log(
        removeUserServer(name) ? t("mcp.removed", { name }) : t("mcp.notFound", { name }),
      );
    });
}
