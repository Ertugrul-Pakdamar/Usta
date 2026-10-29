import { t } from "@usta/core";
import { Box, Text } from "ink";
import { languageOf, type TokenKind, tokenize } from "./highlight.js";

const MAX_LINES = 30;

const TOKEN_COLOR: Record<TokenKind, string | undefined> = {
  keyword: "magenta",
  string: "yellow",
  comment: "gray",
  number: "cyan",
  plain: undefined,
};

/**
 * Colors a unified diff: removed lines red, added lines green with the code highlighted
 * (keywords, strings, comments, numbers). `path` picks the language; `+++ b/file` headers
 * inside the diff (multi-file reviews) switch it per file.
 */
export function DiffView({ diff, path }: { diff: string; path?: string }) {
  const lines = diff.split("\n");
  let language = languageOf(path);
  const rows = lines.slice(0, MAX_LINES).map((line, i) => {
    const key = `${i}:${line}`;
    const header = /^\+\+\+ (?:b\/)?(.+?)(?:\t.*)?$/.exec(line);
    if (header) language = languageOf(header[1]);
    if (line.startsWith("+++") || line.startsWith("---")) {
      return (
        <Text key={key} bold dimColor>
          {line}
        </Text>
      );
    }
    if (line.startsWith("+")) {
      return (
        <Text key={key} color="green">
          +
          {tokenize(line.slice(1), language).map((tok, n) => (
            <Text
              key={`${n}:${tok.text}`}
              color={tok.kind === "plain" ? "green" : TOKEN_COLOR[tok.kind]}
            >
              {tok.text}
            </Text>
          ))}
        </Text>
      );
    }
    if (line.startsWith("-")) {
      return (
        <Text key={key} color="red">
          {line}
        </Text>
      );
    }
    if (line.startsWith("@@")) {
      return (
        <Text key={key} color="cyan">
          {line}
        </Text>
      );
    }
    return (
      <Text key={key} dimColor>
        {line}
      </Text>
    );
  });
  return (
    <Box flexDirection="column">
      {rows}
      {lines.length > MAX_LINES && (
        <Text dimColor>{t("tui.moreLines", { count: lines.length - MAX_LINES })}</Text>
      )}
    </Box>
  );
}
