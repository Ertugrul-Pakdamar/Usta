import { defineTool, z } from "@usta/sdk";

/**
 * Only usable in plan mode. The permission gate shows the plan to the user; `run`
 * is reached only after they approved it (and the mode has already been switched).
 */
export const exitPlanModeTool = defineTool({
  name: "ExitPlanMode",
  description:
    "In plan mode only: present your finished implementation plan (markdown, concrete steps and file paths) for user approval.",
  mutating: false,
  input: z.object({ plan: z.string().min(1) }),
  async run() {
    return "Plan onaylandı. Şimdi planı uygulamaya başlayın.";
  },
});
