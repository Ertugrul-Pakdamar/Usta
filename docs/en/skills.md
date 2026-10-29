# Skills and custom commands

Both are plain Markdown files; no code needed. The format is kept close to Claude Code's, so existing files mostly work as they are.

## Where they live

- User: `~/.usta/skills/<name>/SKILL.md` and `~/.usta/commands/<name>.md`
- Project: `<project>/.usta/skills/…` and `<project>/.usta/commands/…` (a project file beats a user file of the same name)
- `/skills` lists what is loaded. Names: lowercase letters, digits and dashes.

## Skills

Instructions the model loads **when needed**. Only the name and a short description are sent with each request; the full content arrives when the model calls the `Skill` tool (token-friendly).

```markdown
---

name: release-notes
description: This team's release notes format
---

Release notes start with the line "RELEASE-FORMAT-7", followed by a list whose items each begin with a past-tense verb.
```

- `description` is required; it is what the model uses to decide when to load the skill, so write it as "when to use".
- **Cost:** with no skills the `Skill` tool is not sent at all (the fixed payload does not grow). With skills, the tool description lists names + descriptions (fixed for the session, served from the cache); each skill adds a few dozen tokens. The body is capped at 20,000 characters.
- `Skill` is read-only and works in plan mode. Subagents do not get it.
- Tried with the real model: asked to "write release notes", it loaded the skill on its own and applied the format.

## Custom commands

Prompt templates you run with `/name arguments`.

```markdown
---

## description: Fix a bug

Find and fix this bug: $ARGUMENTS. Reproduce it with a test first.
```

`/fix the login page is blank` → the body, with `$ARGUMENTS` replaced, is sent as your prompt. Without `$ARGUMENTS` in the template the arguments are appended. Built-in commands (`/help`, `/mode`…) take precedence. It also works headless: `usta -p "/fix …"`.

## Security: the trust gate for project files

Skills and commands that ship in a repository steer the model or write prompts in your name, so they follow the same rule as [project settings and subagents](permissions.md#project-trust-gate): on first start the content is shown and nothing loads until you approve the **exact content** (changing it asks again; the digest lives in `~/.usta/trust.json`). Files under `~/.usta` are yours and are not asked about. Skills **cannot override permission rules**: every tool call made while following a loaded skill passes the normal gate.
