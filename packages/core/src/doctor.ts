import type { UstaConfig } from "./config.js";
import { fetchQuota } from "./cost.js";
import { t } from "./i18n/index.js";

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
    name: t("doctor.apiKey.name"),
    ok: Boolean(config.apiKey),
    detail: config.apiKey ? t("doctor.apiKey.ok") : t("doctor.apiKey.missing"),
  });
  checks.push({
    name: t("doctor.baseUrl.name"),
    ok: Boolean(config.baseUrl),
    detail: config.baseUrl ? t("doctor.baseUrl.ok") : t("doctor.baseUrl.missing"),
  });
  if (!config.apiKey || !config.baseUrl) return checks;

  const termsCheck = (ok: boolean, detail: string): Check => ({
    name: t("doctor.terms.name"),
    ok,
    detail,
  });

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
      checks.push(termsCheck(false, t("doctor.terms.notAccepted")));
      return checks;
    }
    if (body.accepted === true) {
      checks.push(
        termsCheck(true, t("doctor.terms.accepted", { version: body.current_version ?? "?" })),
      );
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
      checks.push(termsCheck(false, t("doctor.terms.notAccepted")));
    } else if (!res.ok) {
      checks.push({
        name: t("doctor.gateway.name"),
        ok: false,
        detail: t("doctor.gateway.http", { status: res.status }),
      });
    } else {
      const ids = (body.data ?? []).map((m) => m.id);
      checks.push({
        name: t("doctor.gateway.name"),
        ok: true,
        detail: t("doctor.gateway.reachable", { count: ids.length }),
      });
      checks.push({
        name: t("doctor.model.name"),
        ok: ids.includes(config.model),
        detail: config.model,
      });
      const quota = await fetchQuota(config, fetchImpl);
      if (quota) {
        const daily =
          quota.dailyRemainingTokens !== undefined
            ? t("doctor.quota.daily", { tokens: Math.round(quota.dailyRemainingTokens / 1000) })
            : "";
        checks.push({
          name: t("doctor.quota.name"),
          ok: !quota.level || quota.level === "ok",
          detail: `${quota.remainingCr !== undefined ? `${quota.remainingCr} CR` : "?"}${daily}${quota.level && quota.level !== "ok" ? ` (${quota.level})` : ""}`,
        });
      }
    }
  } catch (err) {
    checks.push({ name: t("doctor.gateway.name"), ok: false, detail: String(err) });
  }
  return checks;
}
