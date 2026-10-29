import { Box, Text } from "ink";
import { DiffView } from "./DiffView.js";
import { renderMarkdown } from "./markdown.js";

export type Item =
  | { id: number; kind: "banner"; text: string }
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string }
  | {
      id: number;
      kind: "tool";
      summary: string;
      output: string;
      isError: boolean;
      diff?: string;
    }
  | { id: number; kind: "info"; text: string }
  | { id: number; kind: "error"; text: string };

export function ItemView({ item, width }: { item: Item; width: number }) {
  switch (item.kind) {
    case "banner":
      return (
        <Box marginBottom={1}>
          <Box flexShrink={0}>
            <Text color="cyan" bold>
              usta
            </Text>
          </Box>
          <Text dimColor wrap="truncate-middle">
            {" "}
            {item.text}
          </Text>
        </Box>
      );
    case "user":
      return (
        <Box marginTop={1}>
          <Box flexShrink={0}>
            <Text color="cyan">› </Text>
          </Box>
          <Text>{item.text}</Text>
        </Box>
      );
    case "assistant":
      return (
        <Box marginTop={1}>
          <Box flexShrink={0}>
            <Text color="magenta">● </Text>
          </Box>
          <Box flexGrow={1}>
            <Text>{renderMarkdown(item.text, Math.max(40, width - 4))}</Text>
          </Box>
        </Box>
      );
    case "tool":
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            <Text color={item.isError ? "red" : "green"}>{item.isError ? "✗ " : "⏺ "}</Text>
            <Text bold>{item.summary}</Text>
          </Text>
          {item.diff ? (
            <Box marginLeft={2} flexDirection="column">
              <DiffView diff={item.diff} />
            </Box>
          ) : (
            <Box marginLeft={2}>
              <Text dimColor>⎿ {item.output}</Text>
            </Box>
          )}
        </Box>
      );
    case "info":
      return (
        <Box marginTop={1}>
          <Text dimColor>{item.text}</Text>
        </Box>
      );
    case "error":
      return (
        <Box marginTop={1}>
          <Text color="red">✗ {item.text}</Text>
        </Box>
      );
  }
}
