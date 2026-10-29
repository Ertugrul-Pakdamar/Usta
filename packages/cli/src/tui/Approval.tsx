import { type AskRequest, t } from "@usta/core";
import { Box, Text } from "ink";
import { DiffView } from "./DiffView.js";
import { summarizeCall } from "./format.js";
import { renderMarkdown } from "./markdown.js";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1} marginTop={1}>
      {children}
    </Box>
  );
}

export function Approval({ request, width }: { request: AskRequest; width: number }) {
  if (request.kind === "plan") {
    return (
      <Frame>
        <Text color="yellow" bold>
          {t("tui.plan.title")}
        </Text>
        <Box marginTop={1}>
          <Text>{renderMarkdown(request.plan ?? "", Math.max(40, width - 6))}</Text>
        </Box>
        <Box marginTop={1}>
          <Text>
            <Text color="green">[y]</Text> {t("tui.plan.approveAccept")}{" "}
            <Text color="cyan">[e]</Text> {t("tui.plan.approveAsk")} <Text color="red">[n]</Text>{" "}
            {t("tui.plan.revise")}
          </Text>
        </Box>
      </Frame>
    );
  }
  if (request.kind === "review") {
    return (
      <Frame>
        <Text color="yellow" bold>
          {t("tui.review.title")}
        </Text>
        {request.reason && <Text dimColor>{request.reason}</Text>}
        {request.diff && (
          <Box marginTop={1}>
            <DiffView diff={request.diff} />
          </Box>
        )}
        <Box marginTop={1}>
          <Text>
            <Text color="green">[y]</Text> {t("tui.review.apply")} <Text color="red">[n]</Text>{" "}
            {t("tui.review.skip")}
          </Text>
        </Box>
      </Frame>
    );
  }
  return (
    <Frame>
      <Text color="yellow" bold>
        {t("tui.approval.title", {
          call: summarizeCall(request.tool.name, request.call.arguments),
        })}
      </Text>
      {request.reason && <Text dimColor>{request.reason}</Text>}
      {request.diff && (
        <Box marginTop={1}>
          <DiffView diff={request.diff} />
        </Box>
      )}
      <Box marginTop={1}>
        <Text>
          <Text color="green">[y]</Text> {t("tui.yes")} <Text color="cyan">[a]</Text>{" "}
          {request.rememberLabel ?? t("tui.alwaysSession")} <Text color="red">[n]</Text>{" "}
          {t("tui.no")}
        </Text>
      </Box>
    </Frame>
  );
}
