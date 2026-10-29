import type { UstaConfig } from "./config.js";
import { fetchQuota } from "./cost.js";

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

/**
 * Probes the gateway. Never accepts the terms of service on the user's behalf:
 * when acceptance is required it only reports that fact.
 */
export async function runDoctor(config: UstaConfig, fetchImpl = fetch): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push({
    name: "API anahtarı",
    ok: Boolean(config.apiKey),
    detail: config.apiKey ? "EVREN_API_KEY tanımlı" : "EVREN_API_KEY tanımlı değil",
  });
  checks.push({
    name: "Gateway adresi",
    ok: Boolean(config.baseUrl),
    detail: config.baseUrl
      ? "EVREN_BASE_URL tanımlı"
      : "EVREN_BASE_URL tanımlı değil (bkz. .env.example)",
  });
  if (!config.apiKey || !config.baseUrl) return checks;

  // The gateway tells us directly whether the terms were accepted.
  try {
    const status = await fetchImpl(`${config.baseUrl}/terms/status`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await status.json().catch(() => ({}))) as {
      accepted?: boolean;
      current_version?: number;
      error?: { code?: string };
    };
    if (body.accepted === false || body.error?.code === "terms_not_accepted") {
      checks.push({
        name: "Kullanım şartları",
        ok: false,
        detail: "Kabul edilmemiş. Okumak için `usta terms`, kabul etmek için `usta terms accept`",
      });
      return checks;
    }
    if (body.accepted === true) {
      checks.push({
        name: "Kullanım şartları",
        ok: true,
        detail: `v${body.current_version ?? "?"} kabul edilmiş`,
      });
    }
  } catch {}

  try {
    const res = await fetchImpl(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string };
      data?: { id: string }[];
    };
    if (body.error?.code === "terms_not_accepted") {
      checks.push({
        name: "Kullanım şartları",
        ok: false,
        detail: "Kabul edilmemiş. Okumak için `usta terms`, kabul etmek için `usta terms accept`",
      });
    } else if (!res.ok) {
      checks.push({ name: "Gateway", ok: false, detail: `HTTP ${res.status}` });
    } else {
      const ids = (body.data ?? []).map((m) => m.id);
      checks.push({ name: "Gateway", ok: true, detail: `${ids.length} model erişilebilir` });
      checks.push({
        name: "Varsayılan model",
        ok: ids.includes(config.model),
        detail: config.model,
      });
      const quota = await fetchQuota(config, fetchImpl);
      if (quota) {
        const daily =
          quota.dailyRemainingTokens !== undefined
            ? ` · günlük kalan ${Math.round(quota.dailyRemainingTokens / 1000)}k token`
            : "";
        checks.push({
          name: "Kota",
          ok: !quota.level || quota.level === "ok",
          detail: `${quota.remainingCr !== undefined ? `${quota.remainingCr} CR` : "?"}${daily}${quota.level && quota.level !== "ok" ? ` (${quota.level})` : ""}`,
        });
      }
    }
  } catch (err) {
    checks.push({ name: "Gateway", ok: false, detail: String(err) });
  }
  return checks;
}
