import type { Tool } from "@usta/sdk";
import { bashTool } from "./bash.js";
import { editTool } from "./edit.js";
import { exitPlanModeTool } from "./exit-plan-mode.js";
import { globTool } from "./glob.js";
import { grepTool } from "./grep.js";
import { readTool } from "./read.js";
import { scriptTool } from "./script.js";
import { writeTool } from "./write.js";

export { clearReadCache } from "./read.js";
export { scriptTool } from "./script.js";
export { bashTool, editTool, exitPlanModeTool, globTool, grepTool, readTool, writeTool };

export const builtinTools: Tool<any>[] = [
  readTool,
  writeTool,
  editTool,
  globTool,
  grepTool,
  bashTool,
  scriptTool,
  exitPlanModeTool,
];

/** ExitPlanMode only exists in plan mode: it saves tokens everywhere else. */
export function toolsForMode<T extends { name: string }>(tools: T[], mode: string): T[] {
  return mode === "plan" ? tools : tools.filter((t) => t.name !== "ExitPlanMode");
}
