# Extending

You can extend usta in five ways today; plugins and MCP arrive with the next parts of [M6](roadmap.md).

| Way                        | Status   | Use                                                                 |
| -------------------------- | -------- | ------------------------------------------------------------------- |
| A new built-in tool        | ✅ today | A code contribution: `packages/core/src/tools`                      |
| Hooks                      | ✅ today | A shell command in a settings file: [Hooks](permissions.md#hooks)   |
| A custom subagent          | ✅ today | An `agents/<name>.md` file: [Subagents](subagents.md#custom-agents) |
| Permission rules           | ✅ today | In a settings file: [Permissions](permissions.md)                   |
| Skills and custom commands | ✅ today | A Markdown file: [Skills and commands](skills.md)                   |
| Plugin, MCP connector      | 🔜 M6    | Draft below                                                         |

## Adding a new tool

Tools are defined through `@usta/sdk`. Example: a read-only tool that counts the words in a file.

```ts
// packages/core/src/tools/word-count.ts
import { ToolError, defineTool, z } from "@usta/sdk";
import { readFile } from "node:fs/promises";
import { resolvePath } from "./paths.js";

export const wordCountTool = defineTool({
  name: "WordCount",
  description: "Count the words in a file.", // English, short: it costs tokens on every request
  permission: { kind: "path", target: (i) => i.path }, // permission rules match the file path
  mutating: false, // does not change state
  input: z.object({ path: z.string() }),
  async run({ path }, ctx) {
    const abs = resolvePath(ctx.cwd, path); // applies the secret-file protection
    try {
      const text = await readFile(abs, "utf8");
      return String(text.split(/\s+/).filter(Boolean).length);
    } catch (err) {
      throw new ToolError(`Cannot read ${path}: ${(err as NodeJS.ErrnoException).code}`);
    }
  },
});
```

Steps:

1. Add the file under `packages/core/src/tools/` and put it into the `builtinTools` list in `tools/index.ts` **in a fixed position** (the order is part of the prompt prefix).
2. **Is it really needed?** Every tool costs about 110 tokens on every request. If it can be done with the existing tools (`Bash`, `Script`) do not add a new one; write the reasoning in the PR.
3. Write tests (follow the `tools.test.ts` pattern): the normal path, the error path, the permission behavior. Add an agent scenario with `MockProvider` if needed.
4. Document the tool: [Permissions](permissions.md) (the rule name) and, if needed, [Token economy](token-economy.md).

Rules for writing tools:

- **Errors:** every expected error must be a `ToolError`; the message goes back to the model and the model can correct itself. **Write the messages in English** (the model must behave the same in every language); they do not go into the catalog. Unexpected ones are caught and become `Unexpected error: …`, they do not crash.
- **Text shown to the user** (for example the description of a new slash command, or a warning) goes into the catalog: `core/src/i18n/en.ts` + `tr.ts`, and `t("key")` in code. Details: [Architecture → Localization](architecture.md#localization-i18n).
- **Output size:** the limiter protects you, but do not produce needlessly large output; offer a way to continue such as `offset` (see `Read`).
- **Tools that write** (`mutating: true`): show a diff with `preview`; if the tool is path-based give `permission: { kind: "path", … }` so that checkpoints and `acceptEdits` work correctly.
- **Tools that write many files on their own:** call `ctx.review({summary, diff, paths})` before writing and write nothing until it answers (see `Script`). If `ctx.review` is absent, do not write.
- **Shared state:** `ctx.state` lives for the conversation and may be cleared on summary/rewind; keep caches there.
- Resolve file paths with `resolvePath`; do not bypass the secret-file protection.

## Extending with hooks

The easiest way to add behavior without writing code is a hook: blocking commands, auto-formatting, adding context, audit logs. Protocol and example: [Permissions → Hooks](permissions.md#hooks).

## Planned: plugins and connectors (M6)

> **Draft:** The formats below are design goals; they may change until implemented. They will be kept close to existing Claude Code skill/plugin formats so that migration is easy.

| Concept       | Format                                                 | Note                                                                                                  |
| ------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| **Connector** | MCP servers (stdio / HTTP)                             | `usta mcp add\|list\|remove`; tools appear as `mcp__server__tool`, permission rules apply to them too |
| **Plugin**    | `usta-plugin.json` manifest: packages all of the above | `usta plugin install` from a local folder, git URL or npm                                             |

If you have an idea or a need, open a [feature request](https://github.com/Ertugrul-Pakdamar/Usta/issues/new?template=feature_request.yml); you can shape the M6 design.
