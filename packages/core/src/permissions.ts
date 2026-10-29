import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Tool } from "@usta/sdk";
import picomatch from "picomatch";
import type { Localized, MessageKey, Params } from "./i18n/index.js";

export const PERMISSION_MODES = ["default", "acceptEdits", "auto", "plan", "bypass"] as const;
export type PermissionMode = (typeof PERMISSION_MODES)[number];

/**
 * `reason` is English and goes to the model; `reasonKey` is the same reason for the user,
 * translated when it is shown (approval prompt, denied-call line).
 */
export type Decision =
  | { decision: "allow" }
  | { decision: "deny"; reason: string; reasonKey?: Localized }
  | { decision: "ask"; reason?: string; reasonKey?: Localized }
  /**
   * Auto mode only: neither a rule nor the mode settles it, so the classifier decides whether
   * it may run without asking. Without a classifier this behaves like "ask".
   */
  | { decision: "classify"; reason?: string; reasonKey?: Localized };

const why = (reason: string, key: MessageKey, params?: Params) => ({
  reason,
  reasonKey: { key, params },
});

export interface ParsedRule {
  raw: string;
  tool: string;
  spec?: string;
}

/** `Tool` or `Tool(specifier)`. Returns undefined for malformed rules. */
export function parseRule(raw: string): ParsedRule | undefined {
  const m = /^([A-Za-z0-9_.:*-]+)(?:\(([\s\S]*)\))?$/.exec(raw.trim());
  if (!m) return undefined;
  return { raw: raw.trim(), tool: m[1] as string, ...(m[2] !== undefined && { spec: m[2] }) };
}

// --- Bash -------------------------------------------------------------------------

/** Characters that let a command run something other than what its text says. */
const UNSAFE_FOR_ALLOW = /[`()<>]|\$\(/;
const ALLOW_SPLIT = /&&|\|\||[;|&\n]/;
// Deny splits more aggressively so `echo $(rm -rf x)` still exposes `rm -rf x`.
const DENY_SPLIT = /[;|&\n`()<>]/;

const subCommands = (command: string, splitter: RegExp) =>
  command
    .split(splitter)
    .map((s) => s.trim())
    .filter(Boolean);

function matchesCommand(spec: string, sub: string): boolean {
  if (spec.endsWith(":*")) {
    const prefix = spec.slice(0, -2);
    return sub === prefix || sub.startsWith(`${prefix} `);
  }
  return sub === spec;
}

/** A deny/ask rule matches when ANY sub-command matches. */
export function commandMatchesAny(specs: (string | undefined)[], command: string): boolean {
  const subs = subCommands(command, DENY_SPLIT);
  return specs.some(
    (spec) =>
      spec === undefined ||
      subs.some((s) => matchesCommand(spec, s)) ||
      matchesCommand(spec, command.trim()),
  );
}

/**
 * An allow rule set covers a command only if the command has no way to hide extra
 * execution and EVERY sub-command is matched by some rule.
 */
export function commandCoveredByAllow(specs: (string | undefined)[], command: string): boolean {
  if (specs.includes(undefined)) return true; // bare `Bash` rule: user allowed everything
  const cleaned = command.replaceAll("2>&1", "");
  if (UNSAFE_FOR_ALLOW.test(cleaned)) return false;
  const subs = subCommands(cleaned, ALLOW_SPLIT);
  return (
    subs.length > 0 && subs.every((s) => specs.some((spec) => matchesCommand(spec as string, s)))
  );
}

// --- Paths ------------------------------------------------------------------------

/** realpath of the file, or of its nearest existing parent (new files). */
function realish(abs: string): string {
  try {
    return realpathSync(abs);
  } catch {
    const parent = dirname(abs);
    return parent === abs ? abs : join(realish(parent), basename(abs));
  }
}

export interface ResolvedPath {
  /** Lexical absolute path and the symlink-resolved one. */
  candidates: string[];
  insideCwd: boolean;
}

export function resolveTarget(target: string, cwd: string, home = homedir()): ResolvedPath {
  const expanded = target.startsWith("~/") ? join(home, target.slice(2)) : target;
  const abs = resolve(cwd, expanded);
  const real = realish(abs);
  const realCwd = realish(cwd);
  const rel = relative(realCwd, real);
  return {
    candidates: [...new Set([abs, real])],
    insideCwd: !rel.startsWith("..") && !isAbsolute(rel),
  };
}

export function pathMatches(spec: string, target: string, cwd: string, home = homedir()): boolean {
  const { candidates } = resolveTarget(target, cwd, home);
  const expanded = spec.startsWith("~/") ? join(home, spec.slice(2)) : spec;
  const test = (pattern: string, subject: string) =>
    picomatch(pattern, { dot: true })(subject) ||
    picomatch(`${pattern}/**`, { dot: true })(subject);

  return candidates.some((abs) => {
    if (isAbsolute(expanded)) return test(expanded, abs);
    // Patterns without a slash match by name anywhere (gitignore style).
    if (!expanded.includes("/")) return test(`**/${expanded}`, abs.slice(1));
    const rel = relative(realish(cwd), abs);
    if (rel.startsWith("..")) return false;
    return test(expanded.replace(/^\.\//, ""), rel);
  });
}

// --- Engine -----------------------------------------------------------------------

/** Writing to these always needs a human, even when an allow rule exists. */
const PROTECTED = ["**/.git/**", ".usta/**", "~/.usta/**"];

export interface EngineOptions {
  cwd: string;
  home?: string;
  mode?: PermissionMode;
  allow?: string[];
  deny?: string[];
  ask?: string[];
}

export class PermissionEngine {
  readonly cwd: string;
  private readonly home: string;
  private current: PermissionMode;
  private readonly rules: Record<"allow" | "deny" | "ask", ParsedRule[]> = {
    allow: [],
    deny: [],
    ask: [],
  };
  private listeners = new Set<(mode: PermissionMode) => void>();

  constructor(opts: EngineOptions) {
    this.cwd = opts.cwd;
    this.home = opts.home ?? homedir();
    this.current = opts.mode ?? "default";
    for (const kind of ["allow", "deny", "ask"] as const) {
      for (const raw of opts[kind] ?? []) this.addRule(kind, raw);
    }
  }

  get mode(): PermissionMode {
    return this.current;
  }

  setMode(mode: PermissionMode): void {
    this.current = mode;
    for (const l of this.listeners) l(mode);
  }

  onModeChange(listener: (mode: PermissionMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  addRule(kind: "allow" | "deny" | "ask", raw: string): boolean {
    const rule = parseRule(raw);
    if (!rule) return false;
    this.rules[kind].push(rule);
    return true;
  }

  listRules(): { allow: string[]; deny: string[]; ask: string[] } {
    return {
      allow: this.rules.allow.map((r) => r.raw),
      deny: this.rules.deny.map((r) => r.raw),
      ask: this.rules.ask.map((r) => r.raw),
    };
  }

  /** Rules for this tool whose specifier (if any) matches `target`. */
  private matching(kind: "allow" | "deny" | "ask", tool: Tool, target: string | undefined) {
    return this.rules[kind].filter((r) => {
      if (r.tool !== tool.name) return false;
      if (r.spec === undefined) return true;
      if (target === undefined) return false;
      return tool.permission?.kind === "command"
        ? kind === "allow"
          ? false // allow is evaluated across rules, see decide()
          : commandMatchesAny([r.spec], target)
        : pathMatches(r.spec, target, this.cwd, this.home);
    });
  }

  decide(tool: Tool, input: unknown): Decision {
    const target = tool.permission?.target(input as never);
    const kind = tool.permission?.kind;

    const denied = this.matching("deny", tool, target)[0];
    if (denied) {
      return {
        decision: "deny",
        ...why(`Denied by rule: ${denied.raw}`, "perm.deniedByRule", { rule: denied.raw }),
      };
    }

    if (this.current === "plan" && tool.mutating) {
      return {
        decision: "deny",
        ...why(
          "Plan mode: changes are not allowed. Present your plan with ExitPlanMode when research is done.",
          "perm.planNoChanges",
        ),
      };
    }
    if (tool.name === "ExitPlanMode") {
      return this.current === "plan"
        ? { decision: "ask" }
        : {
            decision: "deny",
            ...why("Not in plan mode; ExitPlanMode is unavailable.", "perm.notPlanMode"),
          };
    }

    if (
      this.current !== "bypass" &&
      tool.mutating &&
      kind === "path" &&
      target !== undefined &&
      PROTECTED.some((p) => pathMatches(p, target, this.cwd, this.home))
    ) {
      return {
        decision: "ask",
        ...why("Protected path (settings or .git); approval required.", "perm.protectedPath"),
      };
    }

    const asked = this.matching("ask", tool, target)[0];
    if (asked) {
      return {
        decision: "ask",
        ...why(`A rule requires approval: ${asked.raw}`, "perm.askRule", { rule: asked.raw }),
      };
    }

    if (this.isAllowed(tool, target)) return { decision: "allow" };
    if (this.current === "bypass") return { decision: "allow" };

    // Saved tool outputs (see the output limiter) are meant to be re-read by the model.
    if (
      !tool.mutating &&
      kind === "path" &&
      target !== undefined &&
      pathMatches("~/.usta/outputs/**", target, this.cwd, this.home)
    ) {
      return { decision: "allow" };
    }
    if (
      kind === "path" &&
      target !== undefined &&
      !resolveTarget(target, this.cwd, this.home).insideCwd
    ) {
      return {
        decision: this.current === "auto" ? "classify" : "ask",
        ...why("Path is outside the working directory.", "perm.outsideCwd"),
      };
    }
    if (!tool.mutating) return { decision: "allow" };
    if ((this.current === "acceptEdits" || this.current === "auto") && kind === "path") {
      return { decision: "allow" };
    }
    return { decision: this.current === "auto" ? "classify" : "ask" };
  }

  /**
   * Decides whether a tool may write a batch of files it chose on its own (after the fact:
   * the paths are only known once a script ran). Same rules as Edit/Write per path.
   */
  decideWrites(paths: string[], toolName: string): Decision {
    const names = [toolName, "Edit", "Write"];
    for (const p of paths) {
      const rule = this.rules.deny.find(
        (r) =>
          names.includes(r.tool) &&
          (r.spec === undefined || pathMatches(r.spec, p, this.cwd, this.home)),
      );
      if (rule) {
        return {
          decision: "deny",
          ...why(`Denied by rule: ${rule.raw} (${p})`, "perm.deniedByRulePath", {
            rule: rule.raw,
            path: p,
          }),
        };
      }
    }
    if (this.current === "plan") {
      return {
        decision: "deny",
        ...why("Plan mode: changes are not allowed.", "perm.planNoChangesShort"),
      };
    }
    if (this.current === "bypass") return { decision: "allow" };
    if (paths.some((p) => PROTECTED.some((pp) => pathMatches(pp, p, this.cwd, this.home)))) {
      return {
        decision: "ask",
        ...why("Protected path (settings or .git); approval required.", "perm.protectedPath"),
      };
    }
    if (paths.some((p) => !resolveTarget(p, this.cwd, this.home).insideCwd)) {
      return {
        decision: "ask",
        ...why("Path is outside the working directory.", "perm.outsideCwd"),
      };
    }
    const allow = this.rules.allow.filter((r) => names.includes(r.tool));
    if (
      paths.every((p) =>
        allow.some((r) => r.spec === undefined || pathMatches(r.spec, p, this.cwd, this.home)),
      )
    ) {
      return { decision: "allow" };
    }
    return this.current === "acceptEdits" || this.current === "auto"
      ? { decision: "allow" }
      : { decision: "ask" };
  }

  private isAllowed(tool: Tool, target: string | undefined): boolean {
    const rules = this.rules.allow.filter((r) => r.tool === tool.name);
    if (!rules.length) return false;
    if (tool.permission?.kind === "command") {
      return (
        target !== undefined &&
        commandCoveredByAllow(
          rules.map((r) => r.spec),
          target,
        )
      );
    }
    return rules.some(
      (r) =>
        r.spec === undefined ||
        (target !== undefined && pathMatches(r.spec, target, this.cwd, this.home)),
    );
  }
}
