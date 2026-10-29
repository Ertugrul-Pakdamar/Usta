import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { defineTool, z } from "@usta/sdk";
import { unifiedDiff } from "./diff.js";
import { resolvePath } from "./paths.js";

export const writeTool = defineTool({
  name: "Write",
  description: "Create or overwrite a file. Use Edit for changes to existing files.",
  permission: { kind: "path", target: (i) => i.path },
  mutating: true,
  input: z.object({ path: z.string(), content: z.string() }),
  async run({ path, content }, ctx) {
    const abs = resolvePath(ctx.cwd, path);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content, "utf8");
    return `Wrote ${path} (${content.split("\n").length} lines).`;
  },
  async preview({ path, content }, ctx) {
    try {
      const before = await readFile(resolvePath(ctx.cwd, path), "utf8").catch(() => "");
      return unifiedDiff(path, before, content);
    } catch {
      return undefined;
    }
  },
});
