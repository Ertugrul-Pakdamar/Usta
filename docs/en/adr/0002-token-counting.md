# ADR-0002: Token counting: calibrated estimate + gateway count

**Status:** Accepted · **Date:** 2026-10-29

## Context
The size of a request must be known before it is sent: context fill, budgets and automatic summarization depend on it. The first plan was to run the Qwen tokenizer locally (`@huggingface/tokenizers`).

When the gateway was explored, we saw:
- `POST /v1/messages/count_tokens` gives an exact count **including** the system prompt and tool schemas.
- Every response returns the real `usage.prompt_tokens`.
- The Qwen `tokenizer.json` is ~11 MB and cannot be downloaded in an environment without internet.

## Decision
1. **Pre-estimate:** an offline estimate whose characters-per-token ratio is calibrated. It is updated with an exponential average from every response's real `usage`; the next request = the last real `usage` + an estimate of what was added.
2. **Exact count:** the gateway's `count_tokens` only when needed (the `/context` breakdown, baseline measurement). If it cannot be reached, fall back to the estimate and label it "estimate" in the output.
3. A local tokenizer dependency is **not added**.

## Consequences
- 11 MB is not added to the package; it works offline.
- The estimate adapts to the language (a Turkish/code mix) because it learns the ratio from measurements.
- The estimate may be rough (on the first request); decisions rest on thresholds (80%, the 80% budget warning) and on the real `usage`, so this is acceptable.
- The budget pre-check was backed by a real measurement: a 300-token budget stopped correctly on a ~1053-token request (the real first request was ~1.1–1.2k).
