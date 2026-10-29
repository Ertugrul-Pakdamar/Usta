import { createInterface } from "node:readline/promises";
import type { LoginIO } from "./login.js";

/** Reads one line without echoing it (for secrets). Backspace works; Ctrl+C aborts. */
function readHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stderr } = process;
    stderr.write(`${question}: `);
    if (!stdin.isTTY) {
      // Piped input: nothing to hide.
      createInterface({ input: stdin }).once("line", (l) => resolve(l));
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const done = (result: () => void) => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stderr.write("\n");
      result();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return done(() => resolve(value));
        if (ch === "\u0003") return done(() => reject(new Error("cancelled")));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

/** Terminal prompts for `usta login` (everything goes to stderr, so stdout stays clean). */
export const terminalIO: LoginIO = {
  async ask(question, fallback) {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      const answer = await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `);
      return answer.trim() || fallback || "";
    } finally {
      rl.close();
    }
  },
  askSecret: readHidden,
  print: (text) => console.error(text),
};
