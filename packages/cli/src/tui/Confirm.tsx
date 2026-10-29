import { t } from "@usta/core";
import { Box, Text } from "ink";

export function Confirm({ message }: { message: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow" bold>
        {message}
      </Text>
      <Text>
        {t("tui.confirm.continue")} <Text color="green">[y]</Text> {t("tui.yes")}{" "}
        <Text color="red">[n]</Text> {t("tui.no")}
      </Text>
    </Box>
  );
}
