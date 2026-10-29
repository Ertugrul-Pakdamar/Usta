// PreToolUse: refuse `git commit --no-verify` and `git push --no-verify`.
export default function noSkipHooks(event) {
  const command = String(event.toolInput?.command ?? "");
  if (/\bgit\s+(commit|push)\b[^|;&]*--no-verify\b/.test(command)) {
    return { decision: "block", reason: "Skipping git hooks (--no-verify) is not allowed here." };
  }
}
