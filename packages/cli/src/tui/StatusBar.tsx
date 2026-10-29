import type { PermissionMode } from "@usta/core";
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
}

const MODE: Record<PermissionMode, { label: string; color?: string }> = {
  default: { label: "izin sor" },
  acceptEdits: { label: "düzenlemeleri kabul", color: "green" },
  plan: { label: "PLAN MODU", color: "yellow" },
  bypass: { label: "TÜMÜNE İZİN", color: "red" },
};

export function StatusBar(p: Props) {
  const m = MODE[p.mode];
  const ctxPct = Math.round(p.contextRatio * 100);
  return (
    <Text dimColor>
      {p.model} ·{" "}
      <Text color={m.color} bold={p.mode !== "default"} dimColor={p.mode === "default"}>
        {m.label}
      </Text>{" "}
      (⇧Tab)
      {p.contextRatio > 0 ? ` · bağlam %${ctxPct}` : ""} · ↑{formatTokens(p.promptTokens)} ↓
      {formatTokens(p.completionTokens)}
      {p.cacheRatio > 0 ? ` · önb. %${Math.round(p.cacheRatio * 100)}` : ""}
      {p.free ? " · ücretsiz" : ""}
      {p.remainingCr !== undefined ? ` · ${p.remainingCr} CR` : ""}
      {p.sessionId ? ` · ${p.sessionId}` : ""} · /help
    </Text>
  );
}
