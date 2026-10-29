/** Public plugin API. Plugin authors depend on this package only. */
import { type ZodType, z } from "zod";

export { z };

export interface ToolContext {
  /** Directory relative paths are resolved against. */
  cwd: string;
  signal?: AbortSignal;
  /** Scratch space shared by all calls of one conversation (e.g. caches). Cleared on compaction. */
  state?: Map<string, unknown>;
  /**
   * Lets a tool that writes many files on its own show the user the full diff and wait for a
   * decision before writing. Absent when nobody can answer (then the tool must not write).
   */
  review?: (req: ReviewRequest) => Promise<ReviewVerdict>;
}

export interface ReviewRequest {
  summary: string;
  /** Unified diff of everything that would change. */
  diff: string;
  /** Absolute paths that would be written or deleted. */
  paths: string[];
}

export type ReviewVerdict = { ok: true } | { ok: false; reason?: string };

export interface Tool<S extends ZodType = ZodType> {
  name: string;
  description: string;
  /** Zod schema of the arguments; also sent to the model as JSON Schema. */
  input: S;
  /** True when the tool changes state (files, processes). Gated by permissions. */
  mutating: boolean;
  /** Returns the text the model will see. Throw `ToolError` for expected failures. */
  run(input: z.infer<S>, ctx: ToolContext): Promise<string>;
  /**
   * What permission rules match against: a file path (glob rules) or a shell command
   * (prefix rules). Tools without it can only be matched by name.
   */
  permission?: { kind: "path" | "command"; target(input: z.infer<S>): string | undefined };
  /** Optional unified diff shown to the user before a mutating call is approved. */
  preview?(input: z.infer<S>, ctx: ToolContext): Promise<string | undefined>;
}

export function defineTool<S extends ZodType>(tool: Tool<S>): Tool<S> {
  return tool;
}

/** An expected failure whose message is returned to the model so it can recover. */
export class ToolError extends Error {}
