import { t } from "@usta/core";
import { Box, Text } from "ink";

const MAX_LINES = 30;

export function DiffView({ diff }: { diff: string }) {
  const lines = diff.split("\n");
  return (
    <Box flexDirection="column">
      {lines.slice(0, MAX_LINES).map((line, i) => {
        const key = `${i}:${line}`;
        if (line.startsWith("+"))
          return (
            <Text key={key} color="green">
              {line}
            </Text>
          );
        if (line.startsWith("-"))
          return (
            <Text key={key} color="red">
              {line}
            </Text>
          );
        if (line.startsWith("@@"))
          return (
            <Text key={key} color="cyan">
              {line}
            </Text>
          );
        return (
          <Text key={key} dimColor>
            {line}
          </Text>
        );
      })}
      {lines.length > MAX_LINES && (
        <Text dimColor>{t("tui.moreLines", { count: lines.length - MAX_LINES })}</Text>
      )}
    </Box>
  );
}
