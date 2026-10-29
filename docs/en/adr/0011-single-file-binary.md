# ADR-0011: Single-file binary: Node SEA + an esbuild bundle

**Status:** Accepted · **Date:** 2026-10-29

## Context

The plan said `bun build --compile` (for offline installs in defense environments). There is no bun on the development machine, and the project is already tied to Node 22 (Ink, the official MCP SDK, `process.loadEnvFile`). Adding another runtime means test and behavior differences.

## Decision

1. **Node "single executable application" (SEA)**, not bun: the same code on the same Node; no runtime difference.
2. **One ES module with esbuild** (`scripts/build-binary.mjs`): the CLI and its dependencies in one file. `react-devtools-core`, which Ink loads only when `DEV=true`, is replaced with an empty module; the version is embedded at build time (there is no `package.json` beside it).
3. **A CommonJS bootstrap plus extraction.** In Node 22 the SEA main script is CommonJS and cannot run an ES module with top-level `await` directly (the yoga wasm uses it). So the bundle is embedded as a SEA asset; the bootstrap unpacks it **once** to `~/.usta/cache/usta-<digest>.mjs` (0600, keyed by content; older versions are removed) and imports it.
4. **An official Node is required.** The binary is a copy of the Node that runs the script; distribution packages (e.g. Fedora) ship a small shell linked to `libnode.so`, which is unsuitable for SEA. The script detects this and stops with a clear error; CI uses `actions/setup-node`.
5. **Distribution:** `release.yml` builds for Linux (x64, arm64), macOS (arm64) and Windows (x64) on a `v*` tag, smoke-tests with `--version`, archives, and attaches the files with SHA-256 sums to a GitHub release. It stops if the tag does not match the `package.json` version.

## Consequences

- The file is **~130 MB** (the Node runtime itself is ~125 MB; ~40 MB in the archive). bun would be similar.
- The first run has a small unpacking cost; later starts are normal.
- Verified: running `-p` with Node hidden from the PATH against the real gateway, the TUI opening in a real terminal, and `@` completion. Targets other than Linux are only built/smoke-tested in CI; the macOS signature is ad-hoc (a real signature is needed for corporate distribution).
- On Windows, `bash` hooks and the `Bash` tool need Git Bash/WSL; the binary does not change that.
