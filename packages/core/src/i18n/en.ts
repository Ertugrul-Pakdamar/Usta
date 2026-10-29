/**
 * User-facing messages, English. This file is the source of truth: its keys define
 * `MessageKey`, and every other language must provide exactly the same keys (the
 * compiler enforces it). Text sent to the MODEL is not here: it stays English literals
 * in the code (see docs/architecture.md, "Localization").
 *
 * Placeholders are `{name}`. A `{one, other}` object is a plural form selected by `{count}`.
 */
export type Message = string | { one: string; other: string };

export const en = {
  // --- units (plural forms)
  "unit.turns": { one: "{count} turn", other: "{count} turns" },
  "unit.files": { one: "{count} file", other: "{count} files" },
  "unit.lines": { one: "{count} line", other: "{count} lines" },
  "unit.messages": { one: "{count} message", other: "{count} messages" },
  "unit.models": { one: "{count} model", other: "{count} models" },
  "unit.requests": { one: "{count} request", other: "{count} requests" },

  // --- errors
  "error.noApiKey": "EVREN_API_KEY is not set.",
  "error.noBaseUrl":
    "EVREN_BASE_URL is not set. Add the gateway address to your .env file (see .env.example).",
  "error.termsNotAccepted":
    "The terms of use are not accepted. Run `usta terms` to read them and `usta terms accept` to accept.",
  "error.contentGuard": "The content safety layer rejected the request: {message}",
  "error.unauthorized": "Invalid API key (HTTP 401).",
  "error.rateLimited": "Rate limit or quota exceeded (HTTP 429).",
  "error.gateway": "Gateway error (HTTP {status}): {message}",
  "error.gatewayStatus": "Gateway error (HTTP {status})",
  "error.invalidSession": "Invalid session file: {path}",
  "error.noSessionToResume": "No session to resume was found.",
  "error.invalidPermissionMode": "Invalid --permission-mode: {mode} ({modes})",
  "error.invalidTokenCount": "Invalid token count: {value} (examples: 200k, 1.5m, 50000)",
  "error.invalidLanguage": "Unsupported language: {value} (supported: {languages})",
  "error.termsNeedTerminal":
    "The terms can only be accepted in an interactive terminal, with your own confirmation.",
  "warn.invalidRule": "Ignored invalid rule: {rule}",

  // --- settings files
  "settings.invalidJson": "{path} is not valid JSON: {message}",
  "settings.invalid": "{path} is invalid:\n{details}",
  "settings.bypassIgnored": '{path}: defaultMode "bypass" is only valid in user settings; ignored.',
  "settings.untrusted":
    "{path}: allow rules, hooks and other trust-gated settings were not applied because the project is not trusted (deny/ask rules were applied).",

  // --- economy, compaction, hooks
  "compaction.empty": "The summary came back empty.",
  "economy.compactFailed": "Could not summarize the context: {message}",
  "economy.budgetExceededTokens":
    "The token budget ({limit}) would be exceeded; the next request carries about {projected} tokens.",
  "economy.budgetExceededCr":
    "The credit budget ({limit} CR) would be exceeded; the next request carries about {projected} tokens.",
  "economy.budgetWarnTokens": "80% of the token budget has been used.",
  "economy.budgetWarnCr": "80% of the credit budget has been used.",
  "economy.quotaLow": "Only {percent}% of today's token quota is left.",
  "hooks.timeout": "Hook timed out after {seconds}s: {command}",
  "hooks.failed": "Hook failed (exit {code}): {command}{detail}",

  // --- permission reasons (shown to the user; the model gets English literals)
  "perm.deniedByRule": "Blocked by rule: {rule}",
  "perm.deniedByRulePath": "Blocked by rule: {rule} ({path})",
  "perm.planNoChanges":
    "Plan mode: changes are not allowed. Present the plan with ExitPlanMode when research is done.",
  "perm.planNoChangesShort": "Plan mode: changes are not allowed.",
  "perm.notPlanMode": "Not in plan mode; ExitPlanMode is unavailable.",
  "perm.protectedPath": "Protected path (settings / .git); approval required.",
  "perm.askRule": "A rule requires approval: {rule}",
  "perm.outsideCwd": "Path outside the working directory.",
  "perm.userDeclined": "You declined.",
  "perm.planDeclined": "You did not approve the plan.",
  "perm.noApproval": "Approval is needed but cannot be asked in this context.",
  "perm.hookBlocked": "Blocked by a hook: {reason}",
  "perm.denied": "{tool} was not allowed: {reason}",
  "perm.deniedNoReason": "{tool} was not allowed.",

  // --- "always allow" labels (approval prompt)
  "gate.rememberEdits": "auto-accept edits in the working directory",
  "gate.rememberDir": "{dir}/** for this session",
  "gate.rememberTool": "{tool} for this session",
  "gate.rememberCommand": "this command for this session ({command})",

  // --- doctor
  "doctor.apiKey.name": "API key",
  "doctor.apiKey.ok": "EVREN_API_KEY is set",
  "doctor.apiKey.missing": "EVREN_API_KEY is not set",
  "doctor.baseUrl.name": "Gateway address",
  "doctor.baseUrl.ok": "EVREN_BASE_URL is set",
  "doctor.baseUrl.missing": "EVREN_BASE_URL is not set (see .env.example)",
  "doctor.terms.name": "Terms of use",
  "doctor.terms.notAccepted":
    "Not accepted. Read them with `usta terms`, accept with `usta terms accept`",
  "doctor.terms.accepted": "v{version} accepted",
  "doctor.gateway.name": "Gateway",
  "doctor.gateway.reachable": { one: "{count} model reachable", other: "{count} models reachable" },
  "doctor.gateway.http": "HTTP {status}",
  "doctor.model.name": "Default model",
  "doctor.quota.name": "Quota",
  "doctor.quota.daily": " · {tokens}k tokens left today",

  // --- command line
  "cli.description": "Token-aware, permission-gated coding agent for EVREN models",
  "cli.opt.print": "run the prompt, print the result and exit (headless)",
  "cli.opt.outputFormat": "text | json",
  "cli.opt.model": "model to use",
  "cli.opt.maxTurns": "maximum agent turns",
  "cli.opt.continue": "continue the latest session of this directory",
  "cli.opt.resume": "continue a specific (or the latest) session",
  "cli.arg.prompt": "start the interactive session with this prompt",
  "cli.opt.permissionMode": "default | acceptEdits | plan | bypass",
  "cli.opt.plan": "start in plan mode (read-only until the plan is approved)",
  "cli.opt.allow": "add an allow rule, e.g. 'Bash(git status:*)'",
  "cli.opt.deny": "add a deny rule, e.g. 'Read(.env)'",
  "cli.opt.trustProject": "trust the repository's .usta/settings.json without asking",
  "cli.opt.budget": "credit (CR) budget for the session",
  "cli.opt.tokenBudget": "total token budget for the session (e.g. 200k)",
  "cli.opt.yes": "bypass mode: allow everything except deny rules (use with care)",
  "cli.opt.lang": "interface language (tr | en)",
  "cli.opt.version": "print the version number",
  "cli.opt.help": "show help",
  "cli.cmd.help": "show help for a command",
  "cli.cmd.doctor": "Check connectivity, key and terms status",
  "cli.cmd.terms": "Show the gateway terms of use; accept them with `terms accept`",
  "cli.cmd.termsAccept": "Read and explicitly confirm the terms (needs an interactive terminal)",
  "cli.cmd.models": "List the models on the gateway",
  "cli.compacted": "Context summarized: {before} → {after}.",
  "cli.planPrompt": "Approve the plan? (if approved, edits are accepted automatically)",
  "cli.reviewPrompt": "Apply the script's changes?",
  "cli.runPrompt": "Run {call}?",
  "cli.error": "Error: {message}",
  "cli.stopped": "Stopped: {detail}",
  "prompt.yesNo": "[y/N]",

  // --- terms
  "terms.footer": "Terms version: v{version}. To accept them run: usta terms accept",
  "terms.confirmWord": "I accept",
  "terms.confirmPrompt":
    'I have read the v{version} terms and accept them. Type "{word}" to confirm: ',
  "terms.notConfirmed": "Not confirmed; nothing was changed.",
  "terms.accepted": "✓ Terms (v{version}) accepted. Verify with: usta doctor",

  // --- project trust prompt
  "trust.header": "This project defines the following in {path}:",
  "trust.warning": "These can run commands on this computer without asking.",
  "trust.question": "Do you trust these project settings?",

  // --- slash commands
  "slash.desc.help": "List commands and shortcuts",
  "slash.desc.clear": "Start a new conversation (and a new session)",
  "slash.desc.model": "Show or change the model: /model <name>",
  "slash.desc.models": "List the models on the gateway",
  "slash.desc.cost": "Token usage, cache, remaining credit and budget",
  "slash.desc.context": "Show where the context window goes",
  "slash.desc.compact": "Summarize older turns to shrink the context: /compact [what to focus on]",
  "slash.desc.session": "Show the session id (resume with: usta --resume <id>)",
  "slash.desc.mode": "Show or change the permission mode: /mode <{modes}>",
  "slash.desc.plan": "Switch to plan mode (read-only until the plan is approved)",
  "slash.desc.permissions": "Show the effective permission rules, hooks and settings files",
  "slash.desc.rewind": "Undo file changes and the conversation of the last turns: /rewind <turns>",
  "slash.desc.lang": "Show or change the interface language: /lang <{languages}>",
  "slash.desc.exit": "Quit",
  "slash.help.shell": "!command    Run a shell command directly (not sent to the model)",
  "slash.help.keys1":
    "Enter sends · end a line with \\ and press Enter for a new line · ↑/↓ history",
  "slash.help.keys2": "Esc cancels running work · Ctrl+C cancels / quits",
  "slash.modelCurrent": "Model: {model}",
  "slash.modelChanged": "Model changed: {model}",
  "slash.noModels": "No models.",
  "slash.session": "Session: {id}",
  "slash.noSession": "No session yet.",
  "slash.modeCurrent": "Permission mode: {mode} (change it with ⇧Tab or /mode <name>)",
  "slash.modeBypassOnly":
    "bypass can only be enabled at startup with --yes / --permission-mode bypass.",
  "slash.modeUnknown": "Unknown mode: {mode}",
  "slash.modeSet": "Permission mode: {mode}",
  "slash.planOn":
    "Plan mode is on. Describe your goal; the model will research and present a plan.",
  "slash.langCurrent":
    "Language: {lang} (change it with /lang <{languages}>; persist it with USTA_LANG or the language setting)",
  "slash.langSet": "Language: {lang}",
  "slash.langUnknown": "Unsupported language: {value} (supported: {languages})",

  // --- interface
  "tui.approval.title": "Permission required: {call}",
  "tui.yes": "yes",
  "tui.no": "no (Esc)",
  "tui.alwaysSession": "always, this session",
  "tui.plan.title": "Plan approval",
  "tui.plan.approveAccept": "approve and auto-accept edits",
  "tui.plan.approveAsk": "approve, ask for each change",
  "tui.plan.revise": "revise (Esc)",
  "tui.review.title": "Apply the script's changes?",
  "tui.review.apply": "apply",
  "tui.review.skip": "don't apply (Esc)",
  "tui.confirm.continue": "Continue?",
  "tui.mode.default": "ask",
  "tui.mode.acceptEdits": "accept edits",
  "tui.mode.plan": "PLAN MODE",
  "tui.mode.bypass": "ALLOW ALL",
  "tui.status.context": "context {percent}%",
  "tui.status.cache": "cache {percent}%",
  "tui.status.free": "free",
  "tui.spinner.thinking": "Thinking",
  "tui.spinner.writing": "Writing",
  "tui.spinner.hint": "({seconds}s · Esc to cancel)",
  "tui.running": "⏺ {summary} running…",
  "tui.resumed": "Resuming session: {id}",
  "tui.newConversation": "new conversation · {model}",
  "tui.cancelled": "Cancelled.",
  "tui.maxTurns": "Turn limit reached; type to continue.",
  "tui.stopped": "Stopped: {detail}",
  "tui.hookBlockedPrompt": "A hook blocked the prompt: {reason}",
  "tui.ctrlCAgain": "Press Ctrl+C again to quit.",
  "tui.compacting": "Summarizing the context…",
  "tui.compacted": "Context summarized: {before} → {after}.",
  "tui.nothingToCompact": "There is not enough older conversation to summarize.",
  "tui.compactFailed": "Could not summarize: {message}",
  "tui.busyCompact": "Cannot summarize while a turn is running.",
  "tui.busyRewind": "Cannot rewind while a turn is running.",
  "tui.nothingToRewind": "Nothing to rewind.",
  "tui.rewindList":
    "Turns you can undo (newest first). Undo the last N with /rewind N:\n{list}\nNote: file changes made through Bash are not tracked.",
  "tui.rewindItem": "{index}. {prompt}{files}",
  "tui.rewindDone":
    "{turns} undone · {restored} restored · {deleted} deleted (the conversation went back to that point too).",
  "tui.unknownCommand": "Unknown command: {command}. Type /help.",
  "tui.moreLines": { one: "… +{count} line", other: "… +{count} lines" },

  // --- reports
  "report.context.title": "Context window: {limit} tokens ({model})",
  "report.context.system": "System prompt",
  "report.context.tools": "Tools",
  "report.context.messages": "Messages",
  "report.context.free": "Free",
  "report.context.summary":
    "Used: {used} ({percent}%) · auto-summary threshold {threshold}% · {source}",
  "report.context.exact": "gateway count",
  "report.context.estimate": "estimate",
  "report.cost.session":
    "This session: {requests} · input {input} · output {output} · {cache}% from cache",
  "report.cost.free": "Price: free",
  "report.cost.freeUntil": "Price: free (until {date})",
  "report.cost.priced":
    "Price: input {inPrice} · output {outPrice} {currency}/token · estimated spend {spent} {currency}",
  "report.cost.remaining": "Credit left: {remaining} CR",
  "report.cost.remainingSpent": "Credit left: {remaining} CR ({spent} spent this session)",
  "report.cost.daily": "Daily quota: {left} / {limit} tokens left",
  "report.cost.tokenBudget": "Token budget: {used} / {limit}",
  "report.cost.crBudget": "Credit budget: {used} / {limit}",
  // --- subagents and tasks
  "agents.noFrontmatter": '{label}: missing "---" frontmatter',
  "agents.invalidName":
    '{label}: invalid name "{name}" (lowercase letters, digits and "-", at most 40)',
  "agents.emptyBody": "{label}: the body (the agent's instructions) is empty",
  "agents.toolForbidden": '{label}: tool "{tool}" is not allowed for subagents; ignored',
  "agents.toolUnknown": '{label}: unknown tool "{tool}"; ignored',
  "agents.noTools": "{label}: no usable tools",
  "agents.badMaxTurns": "{label}: maxTurns must be an integer from 1 to 50",
  "agents.untrusted":
    "{dir}: {count} project agent(s) were not loaded because the project is not trusted.",
  "trust.agentsHeader": "This project defines subagents in {dir}:",
  "trust.agentsWarning":
    "Their instructions steer the model and they can use tools (within your permission rules).",
  "trust.agentsQuestion": "Do you trust these project agents?",
  "slash.desc.tasks": "Subagent tasks: /tasks, /tasks show <id>, /tasks stop <id>",
  "tasks.none": "No tasks.",
  "tasks.line": "{id}  {status}  {agent}: {description} · {elapsed}",
  "tasks.status.queued": "queued",
  "tasks.status.running": "running",
  "tasks.status.done": "done",
  "tasks.status.failed": "failed",
  "tasks.status.cancelled": "cancelled",
  "tasks.notFound": "No task with id {id}.",
  "tasks.stopped": "Task {id} is being stopped.",
  "tasks.notRunning": "Task {id} is not running.",
  "tasks.finished":
    "✓ Task {id} finished: {description} (its report reaches the model with your next message)",
  "tasks.failed": "✗ Task {id} failed: {description}",
  "tasks.cancelled": "Task {id} was cancelled: {description}",
  "tasks.usage": "Usage: /tasks [show <id> | stop <id>]",
  "tui.approval.titleAgent": "Permission required ({agent}): {call}",
  "tui.status.tasks": { one: "{count} task", other: "{count} tasks" },
  // --- auto mode
  "auto.risky": "Auto mode: this call looks risky: {reason}",
  "auto.unsure": "Auto mode could not tell whether this call is safe: {reason}",
  "auto.tripped": "Auto mode paused after {count} calls it could not approve; back to ask mode.",
  "auto.none": "Auto mode has not decided anything yet.",
  "auto.line": "{verdict}  {tool} {input} · {reason}{outcome}",
  "auto.outcome.allowed": " → allowed",
  "auto.outcome.denied": " → denied",
  "auto.stats": "safe {safe} · risky {risky} · unsure {unsure} · classifier calls {calls}",
  "slash.desc.auto": "Show what auto mode decided: /auto",
  "tui.mode.auto": "AUTO",
  "report.permissions.mode": "Mode: {mode}",
  "report.permissions.hooks": "Hooks: {hooks}",
} as const satisfies Record<string, Message>;

export type MessageKey = keyof typeof en;
