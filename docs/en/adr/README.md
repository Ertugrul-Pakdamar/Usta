# Architecture decision records (ADR)

Important decisions that are expensive to reverse are kept here **with their reasoning**. To add an ADR use the next number and fill in these headings: _Status_, _Context_, _Decision_, _Consequences_. If a decision changes, do not delete the old one; mark it **Superseded** by a new ADR.

_Turkish originals: [docs/adr](../../adr/README.md)._

| No                                    | Title                                                 | Status   |
| ------------------------------------- | ----------------------------------------------------- | -------- |
| [0001](0001-tech-stack.md)            | Technology choices                                    | Accepted |
| [0002](0002-token-counting.md)        | Token counting: calibrated estimate + gateway count   | Accepted |
| [0003](0003-script-review-in-tool.md) | Script: approval and apply in one tool call           | Accepted |
| [0004](0004-project-trust-gate.md)    | A trust gate for settings that come from a repository | Accepted |
| [0005](0005-stable-prompt-prefix.md)  | Stable prompt prefix and a trailing temporary message | Accepted |
| [0006](0006-localization.md)          | Localization: user-facing versus model-facing text    | Accepted |
| [0007](0007-subagents.md)             | Subagents: isolated context, shared permission gate   | Accepted |
