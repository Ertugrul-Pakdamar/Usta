# ADR-0003: Script: approval and apply in one tool call

**Status:** Accepted · **Date:** 2026-10-29

## Context
When the same change is needed in many files, one `Edit` call per file means one model turn each. A single script is far cheaper, but the script must be applied safely: the user must see what will happen, and the real project must not change without approval.

The first design had two tools: `Script` (runs on a copy of the project and produces a *changeset*) and `ApplyChanges {id}` (shows the diff and applies it).

## Evidence
It was tried with the real model (`qwen3-vl-30b`). The model chose `Script` correctly and an 8-file change was prepared, but it **did not call `ApplyChanges`**: it asked the user to "run the ApplyChanges command". The result message was made clearer ("do not ask the user first, call `ApplyChanges`"); the same behavior continued in **both attempts**. The model is too inconsistent to rely on chained tool calls.

## Decision
A single tool: `Script`. After the script ran on the copy, the tool has the user approve the full diff **itself** through `ctx.review({summary, diff, paths})` and applies it in the same call after approval.

`ctx.review` is a channel provided by the gate (`createReviewer`): per file `deny` rules, protected paths and paths outside the working directory are checked; the user is asked if needed; the files are checkpointed. If files change while waiting for approval, nothing is applied (all or nothing).

## Consequences
- Model flow: `Glob → Script → done` (3 turns); a second tool turn and ~100 tokens of fixed cost were saved.
- Reliability no longer depends on the model's ability to chain calls.
- Tool authors can use the same `ctx.review` pattern for tools that write many files.
- The copy is **not** a security isolation; so the code is put in front of the user for approval before it runs.
