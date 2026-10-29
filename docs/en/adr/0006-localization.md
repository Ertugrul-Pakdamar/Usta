# ADR-0006: Localization: user-facing versus model-facing text

**Status:** Accepted · **Date:** 2026-10-29

## Context
During M1–M4 the interface text was hard-coded in Turkish (~150 lines in 30 files). English is also needed for open source and international contributions. Meanwhile the same code also produced text that goes to the model (tool results, error messages), and that was Turkish too.

## Decision
1. **Split text into two classes.** *User-facing* text comes from the catalog (`t()`) and changes with the language. *Model-facing* text is **fixed English**, plain strings in code.
2. **The catalog:** `en.ts` is the source, `tr.ts` is `Record<MessageKey, …>`; a missing key **breaks the build**. Plurals `{one, other}`, placeholders `{name}`. Tests check key and placeholder equality.
3. **Two-faced text** (a denied call): the source produces an English `reason` + a translatable `reasonKey`; the loop gives English to the model and the translation to the UI (`display`).
4. **Language order:** `--lang` > `USTA_LANG` > setting > system locale > `tr`. (The first plan said locale > setting; an explicit user choice should beat the system locale.) Another recognized language falls back to `en`; `C`/`POSIX` to `tr`.
5. An external i18n library was **not added**: the need (two languages, placeholders, plurals) is met in a few hundred lines with `Intl`; dependencies are kept few.

## Why model-facing text is not localized
- **Behavior consistency:** the model must interpret the same error the same way in every language; translation differences could change behavior.
- **Tokens:** Turkish costs more tokens; the price is paid in every tool result and every request.
- **Cache:** the prompt prefix must stay byte-for-byte identical ([ADR-0005](0005-stable-prompt-prefix.md)); changing the language must not break the cache.

## Consequences
- The user reads their own language and the model always gets English; `/lang` changes the language during a session and does not affect the cache.
- Adding new user text is two lines (en + tr); a forgotten translation is a compile error in CI.
- Known limit: the section headings in the command-line help (`Usage:`) come from `commander` and stay English.
- Real-environment verification (real model, pty): the English denied-call line, approval box and `/cost` output; with `/lang tr`, `December 1, 2026` → `1 Aralık 2026` and `1,010 CR` → `1.010 CR`.
