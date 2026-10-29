import { type PermissionMode, t } from "@usta/core";
import { Text } from "ink";
import { formatTokens } from "./format.js";

interface Props {
  model: string;
  mode: PermissionMode;
  promptTokens: number;
  completionTokens: number;
  /** Fraction of the context window in use. */
  contextRatio: number;
  cacheRatio: number;
  remainingCr?: number;
  free: boolean;
  sessionId: string | undefined;
  /** Subagent tasks running or queued. */
  tasks?: number;
}

const MODE_COLOR: Record<PermissionMode, string | undefined> = {
  default: undefined,
  acceptEdits: "green",
  plan: "yellow",
  bypass: "red",
};

export function StatusBar(p: Props) {
  const label = t(`tui.mode.${p.mode}`);
  return (
    <Text dimColor>
      {p.model} ·{" "}
      <Text color={MODE_COLOR[p.mode]} bold={p.mode !== "default"} dimColor={p.mode === "default"}>
        {label}
      </Text>{" "}
      (⇧Tab)
      {p.contextRatio > 0
        ? ` · ${t("tui.status.context", { percent: Math.round(p.contextRatio * 100) })}`
        : ""}{" "}
      · ↑{formatTokens(p.promptTokens)} ↓{formatTokens(p.completionTokens)}
      {p.cacheRatio > 0
        ? ` · ${t("tui.status.cache", { percent: Math.round(p.cacheRatio * 100) })}`
        : ""}
      {p.free ? ` · ${t("tui.status.free")}` : ""}
      {p.tasks ? ` · ⚙ ${t("tui.status.tasks", { count: p.tasks })}` : ""}
      {p.remainingCr !== undefined ? ` · ${p.remainingCr} CR` : ""}
      {p.sessionId ? ` · ${p.sessionId}` : ""} · /help
    </Text>
  );
}
