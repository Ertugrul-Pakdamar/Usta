import { commandCoveredByAllow } from "../permissions.js";

export type Verdict = "safe" | "risky" | "unsure";

/** Commands that cannot change anything that matters; allow-style rules (compound-safe). */
const SAFE_COMMANDS = [
  "ls:*",
  "pwd",
  "date",
  "whoami",
  "which:*",
  "wc:*",
  "git status:*",
  "git diff:*",
  "git log:*",
  "git show:*",
  "git branch",
  "git branch --list",
  "git branch -a",
  "git branch -v",
  "git branch -vv",
];

/** Targets that make a recursive delete catastrophic. */
const BROAD_TARGETS = new Set([
  "/",
  "/*",
  "~",
  "~/",
  "~/*",
  "$HOME",
  "$HOME/",
  "$HOME/*",
  "*",
  ".",
  "./",
  "./*",
  "..",
  "../",
  "../*",
]);

const SECRET_PATH =
  /(^|[\s/'"=:])(\.ssh|\.aws|\.gnupg|\.kube|\.docker\/config\.json|\.netrc|\.npmrc|\.pypirc|\.git-credentials|id_rsa|id_ed25519|\.env(?:\.(?!example\b)[\w-]+)?)(?=$|[\s/'";|&)])/;

const WHOLE_COMMAND_PATTERNS: { re: RegExp; reason: string }[] = [
  {
    re: /\b(?:curl|wget)\b[^\n]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/,
    reason: "downloads and runs code (pipe to a shell)",
  },
  { re: /\b(?:ba|z|da)?sh\s+-c\s+["']?\$\(\s*(?:curl|wget)\b/, reason: "downloads and runs code" },
  { re: /<\(\s*(?:curl|wget)\b/, reason: "runs downloaded code" },
  { re: /\|\s*(?:nc|ncat|netcat|socat)\b/, reason: "sends data over a raw network connection" },
  {
    re: /\bcurl\b[^\n|;&]*(?:\s-d\s*@|--data(?:-binary|-raw|-urlencode)?[=\s]+@|\s-F\s+\S*=@|\s-T\s|--upload-file\b)/,
    reason: "uploads a local file",
  },
  {
    re: /(?:>>?|\btee\b(?:\s+-a)?)\s*\/(?:etc|usr|bin|sbin|boot|lib|lib64|var|sys|proc)\b/,
    reason: "writes to a system path",
  },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "fork bomb" },
  {
    re: /\b(?:npm|pnpm|yarn|cargo)\s+publish\b|\btwine\s+upload\b|\bdocker\s+push\b/,
    reason: "publishes to a registry",
  },
  {
    re: /\b(?:terraform|tofu)\s+(?:apply|destroy)\b|\bkubectl\s+(?:delete|apply|exec)\b/,
    reason: "changes remote infrastructure",
  },
  { re: /\bdd\b[^\n]*\bof=\/dev\//, reason: "writes to a device" },
  { re: /\bmkfs(?:\.\w+)?\b|\bfdisk\b|\bshred\b/, reason: "destroys disk data" },
];

/** Splits a command into its sub-commands (any separator, so nothing hides in `$(…)`). */
const subCommands = (command: string) =>
  command
    .split(/[;|&\n`()<>]/)
    .map((s) => s.trim())
    .filter(Boolean);

/** Why a shell command is dangerous no matter what the user asked, or undefined. */
export function dangerousReason(command: string): string | undefined {
  for (const { re, reason } of WHOLE_COMMAND_PATTERNS) if (re.test(command)) return reason;
  if (SECRET_PATH.test(command)) return "touches credentials or secret files";

  for (const sub of subCommands(command)) {
    const t = sub.split(/\s+/);
    const word = t[0] === "env" || t[0] === "command" ? t[1] : t[0];
    if (word === "sudo" || word === "doas" || word === "su") return "privilege escalation";
    if (word === "eval") return "evaluates constructed code";
    const flags = t.filter((x) => x.startsWith("-"));
    const args = t.slice(1).filter((x) => !x.startsWith("-"));
    if (word === "rm") {
      const recursive = flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === "--recursive");
      if (recursive && args.some((a) => BROAD_TARGETS.has(a)))
        return "recursive delete of a broad path";
    }
    if (
      (word === "chmod" || word === "chown") &&
      flags.some((f) => /R/.test(f)) &&
      args.some((a) => a === "/" || a === "~")
    ) {
      return "recursive permission change on a broad path";
    }
    if (word === "git") {
      const sub1 = t.slice(1).find((x) => !x.startsWith("-"));
      const rest = t.join(" ");
      if (sub1 === "push" && /(?:^|\s)(?:--force(?:-with-lease)?|-f|\+\S+)(?:\s|=|$)/.test(rest))
        return "force push";
      if (sub1 === "reset" && /--hard\b/.test(rest))
        return "discards uncommitted work (hard reset)";
      if (sub1 === "clean" && /(?:^|\s)-[a-z]*f/.test(rest)) return "deletes untracked files";
      if (sub1 === "config" && /--global\b|--system\b/.test(rest))
        return "changes global git configuration";
    }
  }
  return undefined;
}

/**
 * A verdict that needs no model: obviously dangerous or obviously harmless shell commands.
 * Other tools are left to the classifier.
 */
export function localVerdict(
  toolName: string,
  input: unknown,
): { verdict: Verdict; reason: string } | undefined {
  if (toolName !== "Bash") return undefined;
  const command = (input as { command?: unknown } | undefined)?.command;
  if (typeof command !== "string") return undefined;
  const danger = dangerousReason(command);
  if (danger) return { verdict: "risky", reason: danger };
  if (commandCoveredByAllow(SAFE_COMMANDS, command))
    return { verdict: "safe", reason: "read-only command" };
  return undefined;
}
