/** A gateway failure with a user-facing (Turkish) message. */
export class GatewayError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export const MISSING_BASE_URL =
  "EVREN_BASE_URL tanımlı değil. Gateway adresini .env dosyanıza ekleyin (bkz. .env.example).";
