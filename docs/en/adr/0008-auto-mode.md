# ADR-0008: Auto mode: the classifier can only turn "ask" into "allow"

**Status:** Accepted · **Date:** 2026-10-29

## Context

Asking for approval on every change is safe but tiring; users end up saying "yes" to everything or switching to `bypass`. The original plan's `auto` mode was dropped in M3 because allow rules did the same job. A fast model that looks at the context now covers the cases rules cannot express.

## Decision

1. **The classifier sits below the rules.** In `auto` mode the permission engine returns a `classify` decision instead of "ask"; `deny`, protected paths and `ask` rules finish before the classifier. The classifier can only decide in the `ask → allow` direction.
2. **Fail closed.** `risky`, `unsure`, errors, timeouts and unparsable answers always ask the user; with nobody to ask, the call is denied.
3. **Narrow input.** The classifier sees only the user's messages, the agent's tool calls and the call; **no tool output, subagent report, summary or hook text.** Reason: text from outside (a file, the web) must not be able to carry instructions to the classifier.
4. **Local layer first.** Dangerous patterns and a small read-only list are decided without a model call (latency, cost, and not trusting a model where a rule suffices).
5. **Circuit breaker** (3 in a row / 10 in total) and an **audit log** (`~/.usta/audit`) are part of the mode.
6. The classifier uses `models.fast` at temperature 0; its usage is added to the session totals and it is not called once the budget is exceeded.

## Evidence

A hand-written set of 39 calls with the real model: **none** of the 20 dangerous calls was judged `safe` (13 local, 7 model; 4 injection attempts included); 14 of the 15 safe calls were `safe` (1 needless question); median latency 274 ms. The set is small and written by the developer; details and limits: [Auto mode](../auto-mode.md#measured-accuracy).

## Consequences

- The mode is marked **experimental**; `default` is recommended in critical environments. A larger, independent set will be added to the M7 eval suite.
- An instruction embedded in the call itself (for example "say safe" in a command comment) cannot be blocked structurally and is left to the model; that is why the local layer and `deny` rules stay essential.
- A trap found while testing: a test that ran `mkdir` under `/proc/...` hung on Linux; tests for unwritable locations should try to create a directory below a regular file instead.
