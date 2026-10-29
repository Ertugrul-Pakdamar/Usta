# ADR-0001: Technology choices

**Status:** Accepted · **Date:** 2026-10-29

## Context

We need a coding agent that runs in the terminal, connects to the EVREN gateway, is extensible and open to contributions. Distribution goal: it must be possible to copy it into environments that have no internet access.

## Decision

- **TypeScript 7 (strict) + Node.js ≥ 22**, pnpm workspaces.
- **Interface:** Ink 8 + React 19 (component based, testable with `ink-testing-library`).
- **Schema/validation:** zod 4 (a tool's input is the single source for both validation and the model's schema).
- **LLM client:** the `openai` SDK, behind our own `Provider` interface (the gateway is OpenAI-compatible).
- **Lint/format:** Biome. **Test:** Vitest.
- **Versioning:** Conventional Commits; Changesets in M7.
- **Distribution:** an npm package; a single-file binary via `bun build --compile` in M7.

## Rejected options

| Option           | Why rejected                                                          |
| ---------------- | --------------------------------------------------------------------- |
| Go + Bubble Tea  | A great single binary, but weak MCP and JS-based plugin ecosystem     |
| Rust + Ratatui   | High barrier to contribution                                          |
| Python + Textual | Start-up time and distribution (offline environments) are problematic |

## Consequences

- The official MCP SDK is TypeScript, so M6 becomes naturally easier.
- Most plugin authors know JS/TS; the contributor pool is wide.
- Node ≥ 22 is required (built-ins such as `process.loadEnvFile` are used).
- TypeScript 7 does not load `@types/node` automatically; `types: ["node"]` is explicit in `tsconfig.base.json`.
