import { type MessageKey, type Params, t } from "./i18n/index.js";

/** A gateway failure with a user-facing message. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

/** A gateway/configuration failure whose message is translated for the user. */
export const gatewayError = (key: MessageKey, params?: Params, code?: string) =>
  new GatewayError(t(key, params), code);
