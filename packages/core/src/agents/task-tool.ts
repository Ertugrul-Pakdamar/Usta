import { defineTool, ToolError, z } from "@usta/sdk";
import type { AgentDefinition } from "./definitions.js";
import { formatReport, type TaskManager } from "./manager.js";

/**
 * The tools a model uses to delegate work. The description lists the available agents, so
 * it is fixed for the session (the agent set does not change while it runs): that keeps the
 * prompt prefix stable for the cache.
 */
export function createTaskTools(manager: TaskManager, agents: AgentDefinition[]) {
  const list = agents.map((a) => `${a.name} (${a.description.slice(0, 70)})`).join(", ");
  const task = defineTool({
    name: "Task",
    description: `Delegate a self-contained task to a subagent with its own context; only its final report comes back. Use for wide searches or independent subtasks; Tasks called in one turn run in parallel. background=true runs it detached. Agents: ${list}.`,
    permission: { kind: "command", target: (i) => i.agent ?? "general" },
    mutating: false,
    input: z.object({
      description: z.string().min(1),
      prompt: z.string().min(1),
      agent: z.string().optional(),
      background: z.boolean().optional(),
    }),
    async run({ description, prompt, agent, background }, ctx) {
      const def = manager.find(agent ?? "general");
      if (!def) {
        throw new ToolError(
          `Unknown agent "${agent}". Available: ${manager.agentNames().join(", ")}`,
        );
      }
      const { id, done } = manager.start(
        { description, prompt, agent: def, background: Boolean(background) },
        ctx.signal,
      );
      const rec = manager.get(id);
      if (rec?.background) {
        return `Started background task ${id} (${def.name}: ${description}). It runs on its own; you will be told when it finishes, or call TaskOutput {"id":"${id}"}.`;
      }
      const stop = manager.onChange((t) => {
        if (t.id === id && t.progress) ctx.progress?.(t.progress);
      });
      try {
        return formatReport(await done);
      } catch (err) {
        throw new ToolError(`Subagent failed: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        stop();
      }
    },
  });

  const output = defineTool({
    name: "TaskOutput",
    description: "Status and report of a background task; wait_seconds waits for it.",
    mutating: false,
    input: z.object({ id: z.string(), wait_seconds: z.number().min(0).max(120).optional() }),
    async run({ id, wait_seconds }, ctx) {
      if (wait_seconds) await manager.wait(id, wait_seconds * 1000, ctx.signal);
      return manager.describe(id);
    },
  });
  return [task, output] as const;
}
