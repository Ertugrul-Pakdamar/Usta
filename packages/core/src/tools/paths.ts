import { basename, resolve } from "node:path";
import { ToolError } from "@usta/sdk";

/** Files the model must never read or write by default (secrets). */
const PROTECTED = [/^\.env(\..*)?$/, /\.(pem|key|p12|pfx)$/];

export function resolvePath(cwd: string, path: string): string {
  const abs = resolve(cwd, path);
  const name = basename(abs);
  if (PROTECTED.some((re) => re.test(name)) && name !== ".env.example") {
    throw new ToolError(`Access denied: ${name} may contain secrets.`);
  }
  return abs;
}
