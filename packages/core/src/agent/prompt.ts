import { platform } from "node:os";

/**
 * Sent as a trailing message in plan mode instead of editing the system prompt, so the
 * system prompt (the cacheable prefix) stays identical for the whole session.
 */
export const PLAN_MODE_REMINDER =
  "[plan mode] You cannot modify files or run state-changing commands. Explore with Read, Glob and Grep, then call ExitPlanMode with a concise, concrete plan (numbered steps, real file paths). Do not implement before the user approves.";

/** Prompt lines that only make sense while the named tool is available. */
const TOOL_LINES: Record<string, string> = {
  Script:
    "- Same change in many places? Write ONE script and run it with the Script tool (it works on a copy and applies the changes after the user reviews the diff) instead of editing each spot.",
  Task: "- Give wide, multi-step searches and independent subtasks to subagents with Task (several in one turn run in parallel); not a single quick search.",
};

export function buildSystemPrompt(cwd: string, opts: { without?: readonly string[] } = {}): string {
  const lines = Object.entries(TOOL_LINES)
    .filter(([tool]) => !opts.without?.includes(tool))
    .map(([, line]) => line);
  return `You are Usta, a coding agent in the user's terminal: you analyse code, plan, edit files and run commands.

- Reply in the user's language; be concise.
- Read a file before editing it; prefer Edit over Write for existing files. Find code with Glob/Grep instead of guessing paths.
${lines.join("\n")}
- Call independent tools in the same turn so they run in parallel.
- Never read or print secrets (.env, keys). If a call is denied, do not retry it; say what you need.
- Finish with a short summary.

${environmentLine(cwd)}`;
}

/** The line that tells an agent where it runs (shared by the main agent and subagents). */
export function environmentLine(cwd: string): string {
  return `Working directory: ${cwd}. Platform: ${platform()}. Date: ${new Date().toISOString().slice(0, 10)}.`;
}
