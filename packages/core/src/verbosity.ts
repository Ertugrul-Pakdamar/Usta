import type { Message } from "./types.js";

const WORDS = 6;
const MIN_REPEAT_CHARS = 300;
const LONG_BETWEEN_TOOLS = 1500;

const shingles = (text: string): Set<string> => {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + WORDS <= words.length; i++) out.add(words.slice(i, i + WORDS).join(" "));
  return out;
};

/** Share (0–1) of `text`'s 6-word runs that already occurred in `before`. */
export function repeatedShare(text: string, before: readonly string[]): number {
  const mine = shingles(text);
  if (!mine.size) return 0;
  const seen = new Set<string>();
  for (const b of before) for (const s of shingles(b)) seen.add(s);
  let hits = 0;
  for (const s of mine) if (seen.has(s)) hits++;
  return hits / mine.size;
}

/** Characters the assistant wrote, and how much of it repeats what it wrote earlier (for the evals). */
export function analyzeAssistantText(messages: readonly Message[]): {
  chars: number;
  repeatRatio: number;
} {
  const before: string[] = [];
  let chars = 0;
  let repeated = 0;
  for (const m of messages) {
    if (m.role !== "assistant" || !m.content) continue;
    chars += m.content.length;
    if (m.content.length >= MIN_REPEAT_CHARS) {
      repeated += repeatedShare(m.content, before) * m.content.length;
    }
    before.push(m.content);
  }
  return { chars, repeatRatio: chars ? Number((repeated / chars).toFixed(3)) : 0 };
}

/**
 * Watches the assistant's messages for two habits that waste tokens and bury the answer: long
 * commentary between tool calls, and restating earlier plans/summaries. When it sees one it
 * returns a short reminder, to be appended to the next tool result (at most every other call).
 */
export class VerbosityGuard {
  private readonly texts: string[] = [];
  private pending: string | undefined;
  private cooldown = 0;

  observe(message: Message): void {
    if (message.role !== "assistant" || !message.content) return;
    const text = message.content;
    if (text.length >= MIN_REPEAT_CHARS && repeatedShare(text, this.texts) > 0.4) {
      this.pending =
        "Your last message repeated earlier content. Do not restate plans or summaries; keep commentary to a few sentences and put the complete findings only in the final answer.";
    } else if (message.toolCalls?.length && text.length > LONG_BETWEEN_TOOLS) {
      this.pending =
        "Keep the text you write between tool calls to a few sentences; save the full write-up for the end.";
    }
    this.texts.push(text);
  }

  /** The reminder for the next tool result, if one is due. */
  take(): string | undefined {
    if (this.cooldown > 0) {
      this.cooldown--;
      return undefined;
    }
    const hint = this.pending;
    this.pending = undefined;
    if (hint) this.cooldown = 1;
    return hint;
  }
}
