import { join } from "node:path";
import {
  installPlugin,
  type PluginManifest,
  pluginsDir,
  readManifest,
  readPluginState,
  removePlugin,
  setPluginEnabled,
  t,
} from "@usta/core";
import type { Command } from "commander";
import { askYesNo } from "./runtime.js";

const versionOf = (m: { version?: string }) => (m.version ? ` v${m.version}` : "");

/** One line per installed plugin (`usta plugin list`, `/plugins`). */
export function formatPlugins(): string {
  const state = readPluginState();
  const names = Object.keys(state).sort();
  if (!names.length) return t("plugin.none");
  return names
    .map((name) => {
      const read = readManifest(join(pluginsDir(), name));
      const manifest: Partial<PluginManifest> = "manifest" in read ? read.manifest : {};
      return t("plugin.line", {
        name,
        version: versionOf(manifest),
        state: t(state[name]?.enabled ? "plugin.state.on" : "plugin.state.off"),
        description: manifest.description ?? "",
      }).trimEnd();
    })
    .join("\n");
}

export function registerPluginCommands(program: Command): void {
  const plugin = program.command("plugin").description(t("cli.cmd.plugin"));

  plugin
    .command("install")
    .description(t("cli.cmd.pluginInstall"))
    .argument("<source>", "folder | git url | github:owner/repo")
    .action(async (source: string) => {
      // The consent cannot be skipped or scripted: what a plugin contains is read by a person.
      if (!process.stdin.isTTY) throw new Error(t("plugin.installNeedsTerminal"));
      const done = await installPlugin(source, {
        confirm: async ({ manifest, lines, replacing }) => {
          console.error(
            `\n${t("plugin.installHeader", {
              name: manifest.name,
              version: versionOf(manifest),
              description: manifest.description ? ` (${manifest.description})` : "",
            })}`,
          );
          for (const line of lines) console.error(`  - ${line}`);
          if (replacing) console.error(t("plugin.installReplacing"));
          console.error(t("plugin.installWarning"));
          return askYesNo(t("plugin.installQuestion"));
        },
      });
      console.log(done ? t("plugin.installed", { name: done.name }) : t("plugin.cancelled"));
    });

  plugin
    .command("list")
    .description(t("cli.cmd.pluginList"))
    .action(() => console.log(formatPlugins()));

  for (const [name, enabled, desc, msg] of [
    ["enable", true, "cli.cmd.pluginEnable", "plugin.enabled"],
    ["disable", false, "cli.cmd.pluginDisable", "plugin.disabledMsg"],
  ] as const) {
    plugin
      .command(name)
      .description(t(desc))
      .argument("<name>")
      .action((n: string) => {
        console.log(
          setPluginEnabled(n, enabled) ? t(msg, { name: n }) : t("plugin.unknown", { name: n }),
        );
      });
  }

  plugin
    .command("remove")
    .description(t("cli.cmd.pluginRemove"))
    .argument("<name>")
    .action((n: string) => {
      console.log(
        removePlugin(n) ? t("plugin.removed", { name: n }) : t("plugin.unknown", { name: n }),
      );
    });
}
