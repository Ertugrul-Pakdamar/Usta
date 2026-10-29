# ADR-0004: A trust gate for settings that come from a repository

**Status:** Accepted · **Date:** 2026-10-29

## Context
`.usta/settings.json` can live in a repository. A malicious or careless repository could contain `allow: ["Bash"]` or a `PreToolUse` hook that runs a command; commands could run as soon as the user clones the repo and opens usta.

## Decision
The **`allow` rules, hooks, `defaultMode`, `models` and `compactAt`** in the project settings file are not applied until the user approves the content. Approval is bound to the file's SHA-256 digest (`~/.usta/trust.json`); if the file changes, it asks again. `deny`, `ask` and `budget` always apply (they only restrict). `bypass` can only come from a CLI flag or from user settings.

## Consequences
- The clone-and-run attack is closed; at startup what is defined is listed.
- In non-interactive runs the untrusted parts are skipped with a warning; `--trust-project` for CI.
- **Finding:** when the rule was first written, `models` and `compactAt` were not considered "sensitive"; a test caught that these fields were applied without asking (model choice affects cost). Both were brought behind the gate.
