import type { Tool } from "@usta/sdk";
import type { ToolCall } from "./types.js";

const SAME_EDIT_FILES = 3;
const MANY_EDITS = 6;

/**
 * Notices repetitive file-by-file editing and nudges the model toward one script
 * (each manual edit costs a full tool round trip). One instance per user prompt.
 */
export class BulkEditNudge {
  private pairs = new Map<string, Set<string>>();
  private edits = 0;
  private hinted = new Set<string>();

  observe(toolName: string, input: unknown): string | undefined {
    if (toolName !== "Edit" && toolName !== "Write") return undefined;
    this.edits++;
    const { path, old_string, new_string } = (input ?? {}) as {
      path?: string;
      old_string?: string;
      new_string?: string;
    };

    if (toolName === "Edit" && path && old_string !== undefined && new_string !== undefined) {
      const key = `${old_string}\0${new_string}`.slice(0, 500);
      const files = this.pairs.get(key) ?? new Set();
      files.add(path);
      this.pairs.set(key, files);
      if (files.size >= SAME_EDIT_FILES && !this.hinted.has(key)) {
        this.hinted.add(key);
        return hint(`You made the same replacement in ${files.size} files.`);
      }
    }
    if (this.edits >= MANY_EDITS && !this.hinted.has("many")) {
      this.hinted.add("many");
      return hint(`You have made ${this.edits} separate file edits.`);
    }
    return undefined;
  }
}

const hint = (what: string) =>
  `[usta hint] ${what} For repetitive changes, write ONE script with the Script tool: it runs on a copy of the project and the user reviews a diff before anything is applied. That is much cheaper than editing file by file.`;

export function createNudgeAfterTool(nudge: BulkEditNudge) {
  return async (tool: Tool<any>, input: unknown, _call: ToolCall, result: { isError: boolean }) =>
    result.isError ? undefined : nudge.observe(tool.name, input);
}
