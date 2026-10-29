import { Marked, type MarkedExtension } from "marked";
import { markedTerminal } from "marked-terminal";

/** Renders markdown to ANSI text; falls back to the raw text if rendering fails. */
export function renderMarkdown(text: string, width: number): string {
  try {
    const marked = new Marked(
      markedTerminal({ width, reflowText: true, tab: 2 }) as unknown as MarkedExtension,
    );
    return (marked.parse(text, { async: false }) as string).trimEnd();
  } catch {
    return text;
  }
}
