# ADR-0007: Subagents: isolated context, shared permission gate

**Status:** Accepted · **Date:** 2026-10-29

## Context

A wide exploration fills the main context with its intermediate output, and that output is billed again on every later request. Running sub-jobs in a separate context and taking only the result both protects the context and allows parallelism. But a subagent must **not weaken** the security guarantees of the main session.

## Decision

1. **Isolated context, one report.** The `Task` tool starts the subagent with its own system prompt and the delegated prompt; only the final report (and a cost note) returns to the main agent. Subagents cannot call `Task` (depth 1).
2. **A shared gate.** Every tool of a subagent goes through **the same permission engine and gate** (mode, rules, hooks, checkpoints). There is no separate permission system; plan mode binds subagents too.
3. **An approval queue.** Many subagents may ask at once; with `serializeAsk` the questions are shown **one box at a time, in order**, and queued ones are denied on abort. Background tasks cannot ask: a call that needs approval is denied.
4. **A write-race guard.** While an agent that can write runs, other writer-capable agents wait in the queue; read-only agents run in parallel (at most 3). `Task` is declared `mutating:false` so read-only agents can run in parallel in the same turn.
5. **Custom agents are behind the trust gate** (same reasoning as [ADR-0004](0004-project-trust-gate.md)): an agent from a repository steers the model and picks a tool list; it is not loaded until its exact content is approved.
6. **Background results** are delivered with a notice and a `<task-notification>` message added to the main conversation on the next turn (`pendingMessages`); they can also be fetched with `TaskOutput`.

## Evidence

Measured with the real model (`qwen3-vl-30b`):
- Reading and summarizing a big file: main context **7406 → 2973** input tokens (−60%), whole session 7610 → 5925.
- For **one small `grep`**, delegating turned out **more expensive** (main context 3316 → 3545, whole session 3440 → 6268): the tool schema and the second turn cost more than the output it keeps.
- The model called two `Task`s in parallel in one turn (6 requests, 2.9 s).
- Fixed cost with `Task`+`TaskOutput`: 1021 → 1281 tokens.

## Consequences

- Delegation is a **double-edged** tool: it pays off for large/multi-step work and loses on small work. The main agent's prompt says so ("do not delegate a single quick search"); the real decision quality will be measured in the M7 evaluation set.
- Because the fixed cost grew, the `Task` descriptions were kept short; the difference is absorbed by the cache after the first request.
- Subagent transcripts are kept separately (`~/.usta/subagents`), so they do not bloat the main session file and stay open to audit.
- A pitfall found in testing: when the main and subagent share one fake provider, the order of requests races; tests route requests by system prompt.
