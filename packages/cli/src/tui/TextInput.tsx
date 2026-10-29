import { Box, Text, useInput } from "ink";
import { useState } from "react";

interface Props {
  isActive: boolean;
  history: string[];
  onChange(value: string): void;
  onSubmit(value: string): void;
  /** Tab: returns the completed text for the current value, or undefined when nothing applies. */
  complete?(value: string): string | undefined;
}

interface State {
  value: string;
  cursor: number;
}

const wordStart = (s: string, from: number) => {
  let i = from;
  while (i > 0 && s[i - 1] === " ") i--;
  while (i > 0 && s[i - 1] !== " " && s[i - 1] !== "\n") i--;
  return i;
};

export function TextInput({ isActive, history, onChange, onSubmit, complete }: Props) {
  const [{ value, cursor }, setState] = useState<State>({ value: "", cursor: 0 });
  const [histIndex, setHistIndex] = useState<number | null>(null);

  const update = (next: State) => {
    setState(next);
    onChange(next.value);
  };

  useInput(
    (input, key) => {
      if (key.return) {
        if (value.endsWith("\\")) {
          const v = `${value.slice(0, -1)}\n`;
          return update({ value: v, cursor: v.length });
        }
        setHistIndex(null);
        update({ value: "", cursor: 0 });
        return onSubmit(value);
      }
      if (key.leftArrow) return update({ value, cursor: Math.max(0, cursor - 1) });
      if (key.rightArrow) return update({ value, cursor: Math.min(value.length, cursor + 1) });
      if (key.upArrow || key.downArrow) {
        if (value.includes("\n") || history.length === 0) return;
        const next = key.upArrow
          ? Math.max(0, (histIndex ?? history.length) - 1)
          : histIndex === null || histIndex >= history.length - 1
            ? null
            : histIndex + 1;
        setHistIndex(next);
        const v = next === null ? "" : (history[next] ?? "");
        return update({ value: v, cursor: v.length });
      }
      if (key.backspace || key.delete) {
        if (cursor === 0) return;
        return update({
          value: value.slice(0, cursor - 1) + value.slice(cursor),
          cursor: cursor - 1,
        });
      }
      if (key.ctrl) {
        if (input === "a") return update({ value, cursor: 0 });
        if (input === "e") return update({ value, cursor: value.length });
        if (input === "u") return update({ value: value.slice(cursor), cursor: 0 });
        if (input === "w") {
          const start = wordStart(value, cursor);
          return update({ value: value.slice(0, start) + value.slice(cursor), cursor: start });
        }
        return;
      }
      if (key.tab) {
        const next = complete?.(value);
        if (next !== undefined) update({ value: next, cursor: next.length });
        return;
      }
      if (key.meta || key.escape || !input) return;
      // Pasted text arrives as one chunk and may contain newlines.
      const text = input.replace(/\r\n?/g, "\n");
      update({
        value: value.slice(0, cursor) + text + value.slice(cursor),
        cursor: cursor + text.length,
      });
    },
    { isActive },
  );

  const lines = value.split("\n");
  let remaining = cursor;
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => {
        const here = remaining <= line.length ? remaining : -1;
        remaining -= line.length + 1;
        const key = `${i}:${line}`;
        return (
          <Box key={key}>
            <Box flexShrink={0}>
              <Text color="cyan">{i === 0 ? "› " : "  "}</Text>
            </Box>
            {isActive && here >= 0 ? (
              <Text>
                {line.slice(0, here)}
                <Text inverse>{line[here] ?? " "}</Text>
                {line.slice(here + 1)}
              </Text>
            ) : (
              <Text>{line}</Text>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
