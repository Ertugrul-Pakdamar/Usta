import type { AskRequest } from "@usta/core";
import { Box, Text } from "ink";
import { DiffView } from "./DiffView.js";
import { summarizeCall } from "./format.js";
import { renderMarkdown } from "./markdown.js";

export function Approval({ request, width }: { request: AskRequest; width: number }) {
  if (request.kind === "plan") {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        marginTop={1}
      >
        <Text color="yellow" bold>
          Plan onayı
        </Text>
        <Box marginTop={1}>
          <Text>{renderMarkdown(request.plan ?? "", Math.max(40, width - 6))}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            <Text color="green">[y]</Text> onayla, düzenlemeleri otomatik kabul et{" "}
            <Text color="cyan">[e]</Text> onayla, her değişikliği sor <Text color="red">[n]</Text>{" "}
            revize et (Esc)
          </Text>
        </Box>
      </Box>
    );
  }
  if (request.kind === "review") {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={1}
        marginTop={1}
      >
        <Text color="yellow" bold>
          Betiğin değişiklikleri uygulansın mı?
        </Text>
        {request.reason && <Text dimColor>{request.reason}</Text>}
        {request.diff && (
          <Box marginTop={1}>
            <DiffView diff={request.diff} />
          </Box>
        )}
        <Box marginTop={1}>
          <Text>
            <Text color="green">[y]</Text> uygula <Text color="red">[n]</Text> uygulama (Esc)
          </Text>
        </Box>
      </Box>
    );
  }
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      <Text color="yellow" bold>
        İzin gerekiyor: {summarizeCall(request.tool.name, request.call.arguments)}
      </Text>
      {request.reason && <Text dimColor>{request.reason}</Text>}
      {request.diff && (
        <Box marginTop={1}>
          <DiffView diff={request.diff} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text>
          <Text color="green">[y]</Text> evet <Text color="cyan">[a]</Text>{" "}
          {request.rememberLabel ?? "bu oturumda hep"} <Text color="red">[n]</Text> hayır (Esc)
        </Text>
      </Box>
    </Box>
  );
}
