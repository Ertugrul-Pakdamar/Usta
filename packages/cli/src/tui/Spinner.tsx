import { t } from "@usta/core";
import { Text } from "ink";
import { useEffect, useState } from "react";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function Spinner({ label }: { label: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 80);
    return () => clearInterval(id);
  }, []);
  return (
    <Text color="cyan">
      {FRAMES[tick % FRAMES.length]} {label}{" "}
      <Text dimColor>{t("tui.spinner.hint", { seconds: Math.floor((tick * 80) / 1000) })}</Text>
    </Text>
  );
}
