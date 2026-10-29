# ADR-0005: Stable prompt prefix and a trailing temporary message

**Status:** Accepted · **Date:** 2026-10-29

## Context
The gateway caches the **prefix** of the prompt (`usage.prompt_tokens_details.cached_tokens`). If even one byte in the prefix changes, everything after that point misses the cache. The first design added a block to the system prompt in plan mode; the prefix broke whenever the mode changed.

## Decision
- The system prompt is generated **once** per session and never changes.
- The mode-dependent reminder (plan mode) is appended to the **end** of the request as a temporary `user` message that is not saved in the history (`volatileTail`).
- The tool list is fixed; `ExitPlanMode` enters the list only in plan mode (a one-off miss on mode change is accepted).
- Tool descriptions are short English; `additionalProperties:false` and safe-integer bounds are removed from the JSON schema.

## Measurements (`count_tokens`, `qwen3-vl-30b`)
| | System | Tools | Total |
|---|---|---|---|
| Before (M1–M3, 7 tools) | 237 | 953 | **1190** |
| After (M4, 8 tools: `Script` added) | 194 | 877 | **1071** |
| After, in plan mode | | | 1151 |

Share served from the cache in real sessions: 49% (2 requests), 64% (3 requests), 97% (6 requests).

## Consequences
- The fixed cost fell ~10% despite adding two tools; the main gain comes from the cache.
- The plan-mode reminder reaches the model on every request but does not break the cache.
- Found during this work: the "baseline ~2.4k" claim in the first plan was wrong (the sum of two requests had been taken as one); the measurement was corrected with the values in this ADR.
