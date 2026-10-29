import { Box, Text } from "ink";

export function Confirm({ message }: { message: string }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow" bold>
        {message}
      </Text>
      <Text>
        Devam edilsin mi? <Text color="green">[y]</Text> evet <Text color="red">[n]</Text> hayır
        (Esc)
      </Text>
    </Box>
  );
}
