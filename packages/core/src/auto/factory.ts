import { homedir } from "node:os";
import { join } from "node:path";
import type { Economy } from "../economy.js";
import type { Message, Provider } from "../types.js";
import { AutoClassifier } from "./classifier.js";

/** Auto-mode classifier wired to the session: fast model, session cost totals, budget, audit log. */
export function createAutoClassifier(opts: {
  provider: Provider;
  economy: Economy;
  /** The main conversation (the classifier reads user messages and tool calls from it). */
  context: () => readonly Message[];
  sessionId: () => string | undefined;
}): AutoClassifier {
  return new AutoClassifier({
    provider: opts.provider,
    model: () => opts.economy.fastModelId,
    context: opts.context,
    onUsage: (usage, model) => opts.economy.trackSubagentUsage(usage, model),
    budgetOk: () => opts.economy.withinBudget(),
    auditFile: () => {
      const id = opts.sessionId();
      return id ? join(homedir(), ".usta", "audit", `${id}.jsonl`) : undefined;
    },
  });
}
