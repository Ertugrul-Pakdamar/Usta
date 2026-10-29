import type { UstaConfig } from "./config.js";
import { GatewayError, gatewayError } from "./errors.js";

export interface Terms {
  version: number;
  content: string;
}

async function call(config: UstaConfig, path: string, init: RequestInit, fetchImpl: typeof fetch) {
  if (!config.apiKey) throw gatewayError("error.noApiKey", undefined, "no_key");
  if (!config.baseUrl) throw gatewayError("error.noBaseUrl", undefined, "no_base_url");
  const res = await fetchImpl(`${config.baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (body.error as { message?: string } | undefined)?.message;
    throw message
      ? new GatewayError(message)
      : gatewayError("error.gatewayStatus", { status: res.status });
  }
  return body;
}

/** Fetches the current terms of service. */
export async function fetchTerms(config: UstaConfig, fetchImpl = fetch): Promise<Terms> {
  const body = await call(config, "/terms/text", {}, fetchImpl);
  return { version: Number(body.version), content: String(body.content ?? "") };
}

/**
 * Records acceptance of the given terms version. This is a legal act: callers must
 * only invoke it after the user has explicitly confirmed — never automatically.
 */
export async function acceptTerms(
  config: UstaConfig,
  version: number,
  fetchImpl = fetch,
): Promise<void> {
  await call(
    config,
    "/terms/accept",
    { method: "POST", body: JSON.stringify({ version }) },
    fetchImpl,
  );
}
