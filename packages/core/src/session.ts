import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { summaryMessage } from "./compaction.js";
import type { Message } from "./types.js";

export interface SessionMeta {
  id: string;
  cwd: string;
  createdAt: string;
  model: string;
}

export interface Session {
  meta: SessionMeta;
  path: string;
}

export interface SessionSummary extends SessionMeta {
  path: string;
  updatedAt: Date;
  /** First user message, for pickers and listings. */
  preview: string;
}

type Line =
  | { type: "meta"; meta: SessionMeta }
  | { type: "message"; message: Message }
  /** Keep only the first `length` messages (written by /rewind). */
  | { type: "truncate"; length: number }
  /** The first `keepFrom` messages were replaced by a summary (context compaction). */
  | { type: "compact"; summary: string; keepFrom: number };

const dirOf = (home: string) => join(home, ".usta", "sessions");

function mask(json: string): string {
  const key = process.env.EVREN_API_KEY;
  return key && key.length >= 8 ? json.split(key).join("***") : json;
}

/** Transcripts may contain tool output, so the files are private (0600/0700). */
export function createSession(cwd: string, model: string, home = homedir()): Session {
  const dir = dirOf(home);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const createdAt = new Date().toISOString();
  const id = `${createdAt.slice(0, 10)}-${Math.random().toString(36).slice(2, 8)}`;
  const meta: SessionMeta = { id, cwd, createdAt, model };
  const path = join(dir, `${id}.jsonl`);
  writeFileSync(path, `${JSON.stringify({ type: "meta", meta } satisfies Line)}\n`, {
    mode: 0o600,
  });
  return { meta, path };
}

export function appendMessage(session: Session, message: Message): void {
  appendFileSync(
    session.path,
    `${mask(JSON.stringify({ type: "message", message } satisfies Line))}\n`,
  );
}

/** Records that the conversation was cut back to its first `length` messages. */
export function truncateSession(session: Session, length: number): void {
  appendFileSync(session.path, `${JSON.stringify({ type: "truncate", length } satisfies Line)}\n`);
}

export function appendCompaction(session: Session, summary: string, keepFrom: number): void {
  appendFileSync(
    session.path,
    `${mask(JSON.stringify({ type: "compact", summary, keepFrom } satisfies Line))}\n`,
  );
}

/** Drops a trailing assistant tool-call turn whose results never arrived (crash/abort). */
function repair(messages: Message[]): Message[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "tool") continue;
    if (m?.role === "assistant" && m.toolCalls?.length) {
      const answered = new Set(
        messages.slice(i + 1).flatMap((x) => (x.role === "tool" ? [x.toolCallId] : [])),
      );
      if (m.toolCalls.some((c) => !answered.has(c.id))) return messages.slice(0, i);
    }
    break;
  }
  return messages;
}

export function loadSession(path: string): { session: Session; messages: Message[] } {
  let meta: SessionMeta | undefined;
  const messages: Message[] = [];
  for (const raw of readFileSync(path, "utf8").split("\n")) {
    if (!raw) continue;
    try {
      const line = JSON.parse(raw) as Line;
      if (line.type === "meta") meta = line.meta;
      else if (line.type === "truncate") messages.length = Math.min(messages.length, line.length);
      else if (line.type === "compact") {
        const kept = messages.slice(line.keepFrom);
        messages.length = 0;
        messages.push(summaryMessage(line.summary), ...kept);
      } else messages.push(line.message);
    } catch {} // a torn last line from a crash is ignored
  }
  if (!meta) throw new Error(`Geçersiz oturum dosyası: ${path}`);
  return { session: { meta, path }, messages: repair(messages) };
}

export function listSessions(home = homedir()): SessionSummary[] {
  const dir = dirOf(home);
  if (!existsSync(dir)) return [];
  const out: SessionSummary[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".jsonl")) continue;
    const path = join(dir, file);
    try {
      const { session, messages } = loadSession(path);
      const first = messages.find((m) => m.role === "user");
      out.push({
        ...session.meta,
        path,
        updatedAt: statSync(path).mtime,
        preview: first?.content.slice(0, 80) ?? "",
      });
    } catch {}
  }
  return out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

/** `idOrPrefix` undefined = most recent session of this directory. */
export function findSession(
  cwd: string,
  idOrPrefix?: string,
  home = homedir(),
): SessionSummary | undefined {
  const all = listSessions(home);
  return idOrPrefix ? all.find((s) => s.id.startsWith(idOrPrefix)) : all.find((s) => s.cwd === cwd);
}
