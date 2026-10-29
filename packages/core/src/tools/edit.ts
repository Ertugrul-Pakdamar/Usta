import { readFile, writeFile } from "node:fs/promises";
import { defineTool, ToolError, z } from "@usta/sdk";
import { unifiedDiff } from "./diff.js";
import { resolvePath } from "./paths.js";

const input = z.object({
  path: z.string(),
  old_string: z.string().min(1),
  new_string: z.string(),
  replace_all: z.boolean().optional(),
});

async function load(abs: string, path: string): Promise<string> {
  try {
    return await readFile(abs, "utf8");
  } catch (err) {
    throw new ToolError(`Cannot read ${path}: ${(err as NodeJS.ErrnoException).code}`);
  }
}

function applyEdit(text: string, { old_string, new_string, replace_all }: z.infer<typeof input>) {
  if (old_string === new_string) throw new ToolError("old_string and new_string are identical.");
  const count = text.split(old_string).length - 1;
  if (count === 0) {
    throw new ToolError(
      "old_string was not found in the file (whitespace and indentation must match exactly).",
    );
  }
  if (count > 1 && !replace_all) {
    throw new ToolError(`old_string occurs ${count} times; add more context or set replace_all.`);
  }
  // split/join avoids `$` replacement patterns being interpreted.
  return { next: text.split(old_string).join(new_string), count: replace_all ? count : 1 };
}

export const editTool = defineTool({
  name: "Edit",
  description:
    "Replace old_string with new_string in a file. old_string must occur exactly once (add context or set replace_all).",
  permission: { kind: "path", target: (i) => i.path },
  mutating: true,
  input,
  async run(args, ctx) {
    const abs = resolvePath(ctx.cwd, args.path);
    const { next, count } = applyEdit(await load(abs, args.path), args);
    await writeFile(abs, next, "utf8");
    return `${args.path}: ${count} replacement${count === 1 ? "" : "s"} applied.`;
  },
  async preview(args, ctx) {
    try {
      const text = await load(resolvePath(ctx.cwd, args.path), args.path);
      return unifiedDiff(args.path, text, applyEdit(text, args).next);
    } catch {
      return undefined; // run() will report the real problem to the model
    }
  },
});
