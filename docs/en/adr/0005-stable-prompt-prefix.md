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

|                                                                      | Total    |
| -------------------------------------------------------------------- | -------- |
| Before (M1–M3, 7 tools)                                              | **1190** |
| After (end of M4, 7 tools; `Script` present, `ApplyChanges` removed) | **989**  |
| M5: subagent tools (`Task`, `TaskOutput`) + one system prompt bullet | **1281** |

> **Correction (during M5):** The 1071 first measured in M4 included the first two-tool design of `Script` (with `ApplyChanges`, 8 tools). When the second tool was removed in [ADR-0003](0003-script-review-in-tool.md), the same setup measured 989. Plan mode adds `ExitPlanMode` (+~80).

Share served from the cache in real sessions: 49% (2 requests), 64% (3 requests), 97% (6 requests).

## Consequences

- The fixed cost fell ~17% compared with M1–M3 (1190 → 989); the main gain comes from the cache. M5's subagent tools raised it to 1281: the price of the feature, which the cache absorbs after the first request.
- The plan-mode reminder reaches the model on every request but does not break the cache.
- Found during this work: the "baseline ~2.4k" claim in the first plan was wrong (the sum of two requests had been taken as one); the measurement was corrected with the values in this ADR.
