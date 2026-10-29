import { defineTool, z } from "@usta/sdk";
import fg from "fast-glob";
import { resolvePath } from "./paths.js";

export const IGNORE = ["**/node_modules/**", "**/.git/**", "**/dist/**"];
const MAX_RESULTS = 200;

export const globTool = defineTool({
  name: "Glob",
  description: "Find files by glob pattern, e.g. 'src/**/*.ts'. Skips node_modules, .git and dist.",
  permission: { kind: "path", target: (i) => i.path ?? "." },
  mutating: false,
  input: z.object({ pattern: z.string(), path: z.string().optional() }),
  async run({ pattern, path }, ctx) {
    const cwd = path ? resolvePath(ctx.cwd, path) : ctx.cwd;
    const files = (await fg(pattern, { cwd, ignore: IGNORE, dot: true })).sort();
    if (!files.length) return "Eşleşen dosya yok.";
    const shown = files.slice(0, MAX_RESULTS).join("\n");
    return files.length > MAX_RESULTS
      ? `${shown}\n… ${files.length - MAX_RESULTS} sonuç daha`
      : shown;
  },
});
