import type { Message } from "../types.js";
import type { AgentDefinition } from "./definitions.js";
import { resolveAgentTools } from "./definitions.js";
import { runSubagent, type SubagentResult, type SubagentRuntime } from "./runner.js";

export type TaskStatus = "queued" | "running" | "done" | "failed" | "cancelled";

export interface TaskRecord {
  id: string;
  description: string;
  agent: string;
  background: boolean;
  status: TaskStatus;
  startedAt: number;
  endedAt?: number;
  result?: SubagentResult;
  error?: string;
  /** What the subagent is doing right now (last tool call). */
  progress?: string;
}

interface Internal extends TaskRecord {
  abort: AbortController;
  /** Resolves when the task is no longer queued/running. */
  finished: Promise<void>;
  /** The result already reached the main conversation (notice delivered or TaskOutput read). */
  reported: boolean;
}

export interface ManagerOptions {
  runtime: SubagentRuntime;
  agents: () => AgentDefinition[];
  /** Subagents running at the same time (the gateway allows many more). */
  maxConcurrent?: number;
  /** When false (headless) `background` is ignored and the task runs in the foreground. */
  allowBackground?: boolean;
}

/** A tiny counting semaphore. */
class Semaphore {
  private waiting: (() => void)[] = [];
  constructor(private free: number) {}
  async acquire(): Promise<void> {
    if (this.free > 0) {
      this.free--;
      return;
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }
  release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.free++;
  }
}

const REPORT_CAP = 6_000;

/**
 * Starts, tracks and cancels subagent runs. Read-only agents run in parallel (up to the
 * limit); agents that can change files take turns, so two of them never edit at once.
 */
export class TaskManager {
  private tasks = new Map<string, Internal>();
  private counter = 0;
  private slots: Semaphore;
  private writers = new Semaphore(1);
  private listeners = new Set<(task: TaskRecord) => void>();

  constructor(private readonly opts: ManagerOptions) {
    this.slots = new Semaphore(opts.maxConcurrent ?? 3);
  }

  get allowBackground(): boolean {
    return this.opts.allowBackground ?? true;
  }

  agentNames(): string[] {
    return this.opts.agents().map((a) => a.name);
  }

  find(name: string): AgentDefinition | undefined {
    return this.opts.agents().find((a) => a.name === name);
  }

  /** Called whenever any task changes (started, progressed, finished). */
  onChange(listener: (task: TaskRecord) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(task: Internal) {
    for (const l of this.listeners) l(this.snapshot(task));
  }

  private snapshot(task: Internal): TaskRecord {
    const { abort: _a, finished: _f, reported: _r, ...rec } = task;
    return rec;
  }

  list(): TaskRecord[] {
    return [...this.tasks.values()].map((t) => this.snapshot(t));
  }

  get(id: string): TaskRecord | undefined {
    const t = this.tasks.get(id);
    return t && this.snapshot(t);
  }

  running(): number {
    return [...this.tasks.values()].filter((t) => t.status === "running" || t.status === "queued")
      .length;
  }

  /**
   * Starts a task. Returns at once with the record and a promise for the final result;
   * a foreground caller awaits it, a background caller does not.
   */
  start(
    input: { description: string; prompt: string; agent: AgentDefinition; background: boolean },
    parentSignal?: AbortSignal,
  ): { id: string; done: Promise<SubagentResult> } {
    const id = `t${++this.counter}`;
    const background = input.background && this.allowBackground;
    const abort = new AbortController();
    // A foreground task follows the parent run's cancellation; a background one is detached.
    if (!background && parentSignal) {
      if (parentSignal.aborted) abort.abort();
      else parentSignal.addEventListener("abort", () => abort.abort(), { once: true });
    }
    const task = {
      id,
      description: input.description,
      agent: input.agent.name,
      background,
      status: "queued" as TaskStatus,
      startedAt: Date.now(),
      abort,
      reported: !background, // foreground results are returned directly
    } as Internal;

    const done = (async (): Promise<SubagentResult> => {
      const writes = resolveAgentTools(input.agent, this.opts.runtime.tools()).some(
        (t) => t.mutating,
      );
      await this.slots.acquire();
      if (writes) await this.writers.acquire();
      try {
        if (abort.signal.aborted) throw new Error("cancelled");
        task.status = "running";
        this.emit(task);
        const result = await runSubagent(this.opts.runtime, input.agent, input.prompt, {
          signal: abort.signal,
          background,
          taskId: id,
          onProgress: (text) => {
            task.progress = text;
            this.emit(task);
          },
        });
        task.result = result;
        task.status =
          abort.signal.aborted || result.stopReason === "aborted" ? "cancelled" : "done";
        return result;
      } catch (err) {
        task.status = abort.signal.aborted ? "cancelled" : "failed";
        task.error = err instanceof Error ? err.message : String(err);
        throw err;
      } finally {
        task.endedAt = Date.now();
        if (writes) this.writers.release();
        this.slots.release();
        this.emit(task);
        void this.opts.runtime.hooks?.run("SubagentStop", {
          sessionId: this.opts.runtime.sessionId?.(),
          agent: task.agent,
          description: task.description,
          result: task.result?.text.slice(0, 2000),
        });
      }
    })();
    task.finished = done.then(
      () => undefined,
      () => undefined,
    );
    this.tasks.set(id, task);
    this.emit(task);
    if (background) done.catch(() => undefined); // a failed background task must not crash the process
    return { id, done };
  }

  /** Waits for a task for at most `ms`. Resolves false on timeout. */
  async wait(id: string, ms: number, signal?: AbortSignal): Promise<boolean> {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.status !== "queued" && task.status !== "running") return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
      signal?.addEventListener("abort", () => resolve(false), { once: true });
    });
    try {
      return await Promise.race([task.finished.then(() => true), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The text the model gets for a finished (or still running) task. */
  describe(id: string, markReported = true): string {
    const t = this.tasks.get(id);
    if (!t) return `No task with id "${id}".`;
    if (markReported) t.reported = true;
    const head = `Task ${t.id} (${t.agent}: ${t.description}) is ${t.status}.`;
    if (t.status === "queued" || t.status === "running") {
      return `${head}${t.progress ? ` Now: ${t.progress}.` : ""} Check again later with TaskOutput.`;
    }
    if (t.status === "failed") return `${head} Error: ${t.error ?? "unknown"}`;
    return `${head}\n${t.result ? formatReport(t.result) : ""}`.trim();
  }

  /** Stops a task. Returns false when it does not exist or already ended. */
  stop(id: string): boolean {
    const t = this.tasks.get(id);
    if (!t || (t.status !== "queued" && t.status !== "running")) return false;
    t.abort.abort();
    return true;
  }

  stopAll(): void {
    for (const t of this.tasks.values())
      if (t.status === "queued" || t.status === "running") t.abort.abort();
  }

  /**
   * Finished background tasks the model has not been told about yet, as conversation
   * messages. Handing them out marks them reported.
   */
  drainNotices(): Message[] {
    const out: Message[] = [];
    for (const t of this.tasks.values()) {
      if (t.reported || (t.status !== "done" && t.status !== "failed" && t.status !== "cancelled"))
        continue;
      t.reported = true;
      const body =
        t.status === "failed"
          ? `Error: ${t.error ?? "unknown"}`
          : t.result
            ? formatReport(t.result)
            : "";
      out.push({
        role: "user",
        content: `<task-notification id="${t.id}" agent="${t.agent}" status="${t.status}" description="${t.description.replace(/"/g, "'")}">\n${body}\n</task-notification>`,
      });
    }
    return out;
  }
}

/** The subagent's report, capped, plus a one-line cost note. */
export function formatReport(r: SubagentResult): string {
  const tokens = r.usage.promptTokens + r.usage.completionTokens;
  const text =
    r.text.length > REPORT_CAP ? `${r.text.slice(0, REPORT_CAP)}\n… [report cut]` : r.text;
  const note =
    r.stopReason === "end_turn"
      ? ""
      : ` Stopped early: ${r.stopReason}${r.stopDetail ? ` (${r.stopDetail})` : ""}.`;
  return `${text}\n[subagent: ${r.turns} turn${r.turns === 1 ? "" : "s"}, ${tokens} tokens.${note}]`;
}
