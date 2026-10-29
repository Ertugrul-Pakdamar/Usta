import type { Message, Provider } from "./types.js";

const SUMMARY_TAG = "<conversation-summary>";

export const isSummary = (m: Message) => m.role === "user" && m.content.startsWith(SUMMARY_TAG);

/** The single message that stands in for the compacted part of a conversation. */
export function summaryMessage(summary: string): Message {
  return {
    role: "user",
    content: `${SUMMARY_TAG}\n${summary}\n</conversation-summary>\nThe earlier part of this conversation was compacted into the summary above. Continue from there.`,
  };
}

export interface CompactResult {
  summary: string;
  /** Number of leading messages replaced by the summary. */
  keepFrom: number;
  /** The new conversation (without system): summary + kept tail. */
  messages: Message[];
  /** Message count before compaction. */
  before: number;
}

const MIN_TAIL = 8;

/**
 * Where the verbatim tail starts. Prefers the start of the Nth-last user prompt; a single
 * very long agentic turn falls back to an assistant boundary so tool calls never get split
 * from their results. Undefined = nothing worth compacting.
 */
export function findKeepFrom(messages: readonly Message[], keepTurns: number): number | undefined {
  const prompts = messages.flatMap((m, i) => (m.role === "user" && !isSummary(m) ? [i] : []));
  const byTurn = prompts.length > keepTurns ? prompts[prompts.length - keepTurns] : undefined;
  if (byTurn !== undefined && byTurn > 0) return byTurn;
  for (let i = messages.length - MIN_TAIL; i > 0; i--) {
    if (messages[i]?.role === "assistant") return i;
  }
  return undefined;
}

const TOOL_RESULT_CAP = 1_500;
const TRANSCRIPT_CAP = 700_000;

function transcript(messages: readonly Message[]): string {
  const rows = messages.map((m) => {
    if (m.role === "tool") return `TOOL_RESULT: ${m.content.slice(0, TOOL_RESULT_CAP)}`;
    if (m.role === "assistant") {
      const calls = (m.toolCalls ?? []).map(
        (c) => `TOOL_CALL ${c.name}(${c.arguments.slice(0, 300)})`,
      );
      return [`ASSISTANT: ${m.content}`, ...calls].join("\n");
    }
    return `${m.role.toUpperCase()}: ${m.content}`;
  });
  const text = rows.join("\n\n");
  return text.length > TRANSCRIPT_CAP
    ? `[older part omitted]\n${text.slice(-TRANSCRIPT_CAP)}`
    : text;
}

const SUMMARIZER_SYSTEM =
  'You compress a coding-agent conversation so work can continue after the earlier messages are dropped. Write a dense, factual summary in English with these sections: Goal; Decisions and constraints (including user instructions that must keep applying); Files read or changed (paths) and what changed; Commands run and notable results; Current state and next steps. Do not invent facts. You only see the OLDER part of the conversation; newer messages are kept separately, so never claim that nothing else happened and avoid words like "only" or "no other" about the whole session. Maximum 700 words.';

export interface CompactOptions {
  provider: Provider;
  model: string;
  /** The conversation without the system message. */
  messages: readonly Message[];
  keepTurns?: number;
  instruction?: string;
  signal?: AbortSignal;
}

export async function compactMessages(opts: CompactOptions): Promise<CompactResult | undefined> {
  const keepFrom = findKeepFrom(opts.messages, opts.keepTurns ?? 2);
  if (keepFrom === undefined) return undefined;
  const head = opts.messages.slice(0, keepFrom);
  const focus = opts.instruction ? `\n\nFocus especially on: ${opts.instruction}` : "";

  let summary = "";
  for await (const ev of opts.provider.stream({
    model: opts.model,
    messages: [
      { role: "system", content: SUMMARIZER_SYSTEM },
      { role: "user", content: `Conversation to summarize:\n\n${transcript(head)}${focus}` },
    ],
    maxTokens: 2_000,
    signal: opts.signal,
  })) {
    if (ev.type === "text") summary += ev.delta;
  }
  summary = summary.trim();
  if (!summary) throw new Error("Özet boş döndü.");
  return {
    summary,
    keepFrom,
    messages: [summaryMessage(summary), ...opts.messages.slice(keepFrom)],
    before: opts.messages.length,
  };
}
