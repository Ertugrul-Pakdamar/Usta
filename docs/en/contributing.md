# Contributing to usta

Thank you for your interest in usta! This guide describes the shortest path from an idea to a merged change. Your participation is subject to the [Code of Conduct](../../CODE_OF_CONDUCT.md).

_Turkish version: [CONTRIBUTING.md](../../CONTRIBUTING.md)._

## Contents

1. [Before you start](#before-you-start)
2. [Development environment](#development-environment)
3. [Repository layout](#repository-layout)
4. [Workflow](#workflow)
5. [Code standards](#code-standards)
6. [Testing](#testing)
7. [Security-sensitive areas](#security-sensitive-areas)
8. [Documentation and decision records](#documentation-and-decision-records)
9. [Pull request checklist](#pull-request-checklist)
10. [License](#license)

## Before you start

- For **small fixes** (a typo, docs, an obvious bug) you can open a PR directly.
- For a **new feature or a behavior change** open an [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues/new/choose) first, so your effort does not go in a direction that conflicts with the [roadmap](roadmap.md).
- **Found a security vulnerability?** Do not open a public issue; see [SECURITY.md](../../SECURITY.md).
- To see what you can work on look at the `good first issue` and `help wanted` labels and at the next milestone in the [roadmap](roadmap.md).

## Development environment

**Requirements:** Node.js ≥ 22 (`.nvmrc`), [pnpm](https://pnpm.io) 12, `python3` (for the Script tests), optionally `rg`.

```sh
git clone git@github.com:Ertugrul-Pakdamar/Usta.git
cd Usta
pnpm install
pnpm build          # packages use each other's built (dist) output
pnpm test           # all tests; no real API key or network needed
pnpm lint           # Biome
```

| Command       | What it does                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `pnpm build`  | Builds all packages with `tsc -b` (**required before tests**: `cli` tests use the built output of `core`) |
| `pnpm test`   | All tests with Vitest                                                                                     |
| `pnpm lint`   | Biome check: code **and Markdown formatting** (required in CI; if it fails run `pnpm format`)             |
| `pnpm format` | Format with Biome and apply safe fixes                                                                    |
| `pnpm usta …` | Runs the built CLI (e.g. `pnpm usta doctor`)                                                              |

To try it against the real gateway copy `.env.example` to `.env` and fill it in ([Getting started](getting-started.md)). **`.env` is never committed**; tests never use a real key.

## Repository layout

```
packages/
  sdk/   public API (Tool, defineTool, ToolError): the only surface plugin/tool authors see
  core/  UI-independent core: agent loop, tools, permissions, token economy, localization
  cli/   Ink interface, slash commands, headless mode
  mcp/   MCP connectors (M6)
docs/    documentation and architecture decision records (ADR); docs/en holds the English version
```

An important rule: **`core` knows nothing about the UI** (it never imports Ink/React); everything exposed goes through `sdk`. Details: [architecture.md](architecture.md).

## Workflow

1. Fork the repo and branch from `main`: `feat/short-description`, `fix/short-description`, `docs/…`. (`main` is protected: every change goes through a pull request.)
2. Keep the change **small and focused**. A PR should do one thing; do not mix formatting and behavior changes.
3. Write the test (or a failing example) first; then fix.
4. All of these must be green locally:

   ```sh
   pnpm lint && pnpm build && pnpm test
   ```
5. Commit in [Conventional Commits](https://www.conventionalcommits.org/) form:

   ```
   feat(core): ask interactively when the budget would be exceeded
   fix(cli): do not truncate the banner on long paths
   docs: add a hook example to the permissions page
   test(core): attempt to bypass a deny rule through a symlink
   ```

   Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `chore`. Scopes: `core`, `cli`, `sdk`, `mcp`, `docs`.
6. Open a PR, fill in the template, wait for CI. Merging is by **squash**; the PR title becomes the commit message.

## Code standards

- **TypeScript strict.** Use `any` only when unavoidable (for example the heterogeneous tool list). Do not swallow errors; return a meaningful error to the model with `ToolError`.
- **Formatting and lint are Biome;** do not debate them, run `pnpm format`.
- **Readability comes first.** Follow the naming and comment density of the surrounding code. A comment explains **why**, not what.
- **Small files, clear responsibility.** A module does one thing (`permissions.ts` only decides, `gate.ts` only wires).
- **Discuss before adding a dependency:** size, maintenance status and working in an air-gapped environment matter. Runtime dependencies are kept few on purpose.
- **Text language:** Code, comments and identifiers are English. Text comes in **two classes**: everything _sent to the model_ (system prompt, tool descriptions, tool results and error messages, denial reasons) is short **fixed English** written plainly in code; everything _shown to the user_ comes from the catalog via `t("key")` (`packages/core/src/i18n`: `en.ts` first, then `tr.ts`; a missing translation breaks the build). Details: [Architecture → Localization](architecture.md#localization-i18n).
- **Do not add telemetry.** usta sends no data outside the gateway; this is a product guarantee.

## Testing

| What is tested                                   | How                                                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Pure logic (permission engine, parsers, economy) | Direct unit tests; include edge cases and **bypass attempts**                                       |
| Agent behavior                                   | A scenario with `MockProvider`: model replies are written in advance, outgoing requests are checked |
| File system                                      | A temporary directory (`mkdtemp`); do not touch the real user directory (isolate `HOME`)            |
| Interface                                        | `ink-testing-library`; **write the text and Enter separately** (so it is not treated as a paste)    |
| Gateway calls                                    | A fake `fetch`; no real network or key                                                              |

**Also try interface changes in a real terminal.** Unit tests cannot catch layout problems (for example the banner truncation on a long directory path was only seen in a real terminal). Mentioning in the PR description, in one sentence, that you ran `pnpm usta` inside a pty and checked the change by eye helps a lot.

Every PR that fixes a bug must contain a test that reproduces it and proves the fix.

## Security-sensitive areas

Changes touching these get **extra care** in review: `permissions.ts`, `gate.ts`, `settings.ts`, `hooks.ts`, `tools/*` (especially `bash`, `script`, `paths`), `session.ts`, `checkpoint.ts`.

- **Fail closed:** when unsure, ask or deny; never allow silently.
- **`deny` is above everything.** No mode, hook or heuristic can override it.
- If security behavior changes, add tests that include **bypass attempts** (symlink, `..`, compound command, `$(…)`).
- Think about what could leak to the model and to disk: the API key, `.env`, session files.

## Documentation and decision records

- Every user-visible behavior change must update the relevant [documentation](README.md) and [CHANGELOG.md](../../CHANGELOG.md).
- If you change the **architecture or an expensive-to-reverse decision** add a short ADR under [docs/en/adr](adr/README.md) (and its Turkish original under `docs/adr`): _Context, Decision, Consequences_ and, if possible, **measurements/evidence**. In usta, decisions rest on measurement, not guesswork.
- Adding a new tool? Read the [Extending](extending.md) guide first; every tool costs ~110 tokens on every request, so the reason it is needed should be in the PR.
- **Keep both languages in step.** A change to a Turkish document must update its English counterpart in `docs/en` (or say in the PR that the translation follows).

## Pull request checklist

- [ ] `pnpm lint && pnpm build && pnpm test` are green
- [ ] A test was added for the new behavior (a reproducing test for a bug fix)
- [ ] Docs (both languages) and CHANGELOG are updated
- [ ] New user-facing text was added to the catalog (`en.ts` + `tr.ts`); model-facing text is English
- [ ] No secrets (keys, `.env`, internal addresses)
- [ ] If it touches security-sensitive areas: bypass tests exist and `deny` precedence is preserved
- [ ] If it has an architectural impact an ADR was added
- [ ] If it is an interface change it was tried in a real terminal

## License

By contributing you agree that your contribution is licensed under the project's [Apache License 2.0](../../LICENSE) (Apache-2.0 §5). No separate CLA is required.

For questions you can open an [issue](https://github.com/Ertugrul-Pakdamar/Usta/issues).
