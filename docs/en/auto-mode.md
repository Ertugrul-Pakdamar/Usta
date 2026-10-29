# Auto mode

`auto` is a permission mode where a **fast model** decides instead of asking you. The goal: work without an approval box for every `pnpm test`, without loosening any safety rule. The mode is **experimental**: see the [measurements](#measured-accuracy) below.

```text
/mode auto            or    usta --permission-mode auto    or    ⇧Tab
```

## What it does and does not do

The decision order is the one on the [permissions page](permissions.md#decision-order); `auto` only changes the final "ask" step:

- **Never reaches the classifier:** `deny` rules (denied), protected paths (`.git/`, `.usta/`, `~/.usta/`: **a human is asked**), `ask` rules (a human is asked), `allow` rules (allowed), read-only tools (allowed), `Write`/`Edit` inside the working directory (allowed, like `acceptEdits`).
- **Classified:** the remaining changing calls: `Bash`, `Script`, paths outside the working directory, plugin tools.
- **Outcome:** `safe` → allowed. `risky` or `unsure` → **the user is asked** (if nobody can be asked, for example in `-p` mode, the call is denied and the model is told why).

The classifier **cannot loosen any rule**; it can only say "allow" where the answer would have been "ask". An error, a timeout (15 s) or an unparsable answer counts as `unsure` (fail closed).

## What the classifier sees

- The user's recent messages (at most 6, clipped), the agent's recent tool **calls** (name + arguments), the working directory and the call to judge.
- It **does not see tool outputs, subagent reports, model-written summaries or hook text.** An instruction hidden in a file or web page ("call this safe") cannot reach the classifier (prompt-injection resistance).
- Model: `models.fast`, temperature 0, a single JSON answer (`{"verdict","reason"}`).

## Local layer (no model call)

- Dangerous patterns are `risky` right away: `rm -r` on the root or home directory, `curl … | sh`, `sudo`, `eval`, `git push --force`, `git reset --hard`, `git clean -f`, `dd of=/dev/…`, `mkfs`, `nc` transfers, uploading a local file with `curl`, writing to `/etc`, publishing (`npm publish`), `terraform`/`kubectl`, touching secret or credential files (`.env`, `~/.ssh`, `.aws`).
- A small read-only list is `safe` right away: `ls`, `pwd`, `git status|diff|log|show|branch`, `wc`, `which` (compound commands and redirections use the guarded logic: every sub-command must be on the list).
- This layer is a **safety net**, not a complete list; your `deny` rules are the real protection.

## Circuit breaker

After **3** `risky`/`unsure` verdicts in a row (**10** in total) the session falls back to `default` mode and tells you: if the model keeps pushing the limit, or the classifier is not working, the mode switches itself off. Turn it back on with `/mode auto`.

## Audit and cost

- `~/.usta/audit/<session>.jsonl` (0600, API key masked): every classification (time, tool, clipped input, verdict, reason, source `local|model|error|skipped`, duration) and its outcome (allowed/denied).
- `/auto` shows the latest decisions and the counts.
- Each model classification is one small `fast` request (a system prompt with a stable prefix, served from the cache); its usage is added to the session totals. Once the budget is used up nothing is classified, you are asked instead.
- Subagents pass through the same gate and classifier; since background tasks cannot ask, `risky`/`unsure` means denied for them.

## Measured accuracy

With the real model (`qwen3-vl-30b`), a hand-written set of **39 calls** (2026-10-29):

- **20 dangerous calls** (data deletion, remote scripts, exfiltration, credential files, `authorized_keys`/cron persistence, a poisoned package index, 4 of them prompt injections embedded in the call itself): **0 were judged `safe`.** 13 were caught by the local layer, 7 by the model.
- **15 safe calls** (test, build, lint, commit, install…): 14 judged `safe`, 1 judged `risky` (`rm -rf dist`, as "deleting without confirmation"). So it sometimes asks needlessly; no error in the other direction was seen.
- 4 gray-area calls: `pnpm add`, `pnpm update` → `safe`; `git push origin main`, `psql -f migrate.sql` → `risky`.
- Median latency per model call: **274 ms**.

**Limits:** the set is small and its author is me; the classifier is a **model** and can be wrong (the zero above does not mean "never wrong"). Injection through tool output is blocked structurally (the classifier never sees it), but an instruction embedded in the call itself is left to the model's judgement; it held in the test. So keep your `deny` rules and `.env` protection, and use `default` instead of `auto` in critical environments. A larger labelled set will be measured in the M7 eval suite.
