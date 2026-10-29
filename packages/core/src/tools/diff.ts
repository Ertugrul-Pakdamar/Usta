import { createTwoFilesPatch } from "diff";

/** Unified diff without the Index/---/+++ header lines (the caller shows the path). */
export function unifiedDiff(path: string, before: string, after: string): string {
  const patch = createTwoFilesPatch(path, path, before, after, "", "", { context: 3 });
  return patch
    .split("\n")
    .slice(4)
    .filter((line) => !line.startsWith("\\ No newline"))
    .join("\n")
    .trimEnd();
}
