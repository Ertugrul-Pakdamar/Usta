import { supportsLanguage } from "cli-highlight";
import { Marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";

/**
 * The highlighter prints "Could not find the language 'env'" to stderr for a code fence whose
 * language it does not know (models write ```env, ```dotenv, ```gitignore …). Unknown languages
 * are rewritten to `plaintext` before rendering so the screen stays clean.
 */
export function normalizeFences(text: string): string {
  return text.replace(
    /^([ \t]*(?:`{3,}|~{3,}))[ \t]*([^\s`~]+)/gm,
    (match, fence: string, lang) => {
      const name = String(lang).toLowerCase();
      return supportsLanguage(name) ? match : `${fence}plaintext`;
    },
  );
}

/** Renders markdown to ANSI text; falls back to the raw text if rendering fails. */
export function renderMarkdown(text: string, width: number): string {
  try {
    const marked = new Marked(
      markedTerminal({ width, reflowText: true, tab: 2 }) as unknown as MarkedExtension,
    );
    return tidy((marked.parse(normalizeFences(text), { async: false }) as string).trimEnd());
  } catch {
    return text;
  }
}

/** Collapses the runs of blank lines marked-terminal leaves inside nested lists. */
export function tidy(rendered: string): string {
  return rendered.replace(/\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n");
}
