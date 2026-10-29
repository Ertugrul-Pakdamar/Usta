import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CheckpointTurn {
  /** Conversation length (excluding system) before this turn's user message. */
  messageCount: number;
  prompt: string;
  /** `backup: null` means the file did not exist before the turn. */
  files: { path: string; backup: string | null }[];
}

export interface RewindResult {
  turns: CheckpointTurn[];
  restored: string[];
  deleted: string[];
  messageCount: number;
}

/**
 * Per-session undo log. Before a file tool changes a file, its previous content is
 * copied aside; `rewind` puts files back and tells the caller how far to cut the
 * conversation. Files changed by Bash are NOT tracked.
 */
export class CheckpointStore {
  private turns: CheckpointTurn[] = [];

  private constructor(private readonly dir: string) {
    const index = join(dir, "index.json");
    if (existsSync(index)) this.turns = JSON.parse(readFileSync(index, "utf8"));
  }

  static open(sessionId: string, home = homedir()): CheckpointStore {
    const dir = join(home, ".usta", "checkpoints", sessionId);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    return new CheckpointStore(dir);
  }

  list(): readonly CheckpointTurn[] {
    return this.turns;
  }

  beginTurn(messageCount: number, prompt: string): void {
    this.turns.push({ messageCount, prompt: prompt.slice(0, 80), files: [] });
    this.save();
  }

  /** Call right before modifying `path`. Only the first change per turn is recorded. */
  record(path: string): void {
    const turn = this.turns.at(-1);
    if (!turn || turn.files.some((f) => f.path === path)) return;
    let backup: string | null = null;
    if (existsSync(path) && statSync(path).isFile()) {
      backup = `${this.turns.length - 1}-${turn.files.length}.bak`;
      copyFileSync(path, join(this.dir, backup));
    }
    turn.files.push({ path, backup });
    this.save();
  }

  /**
   * After the first `keepFrom` messages were replaced by a one-message summary, message
   * counts shrink accordingly. Turns older than that boundary can only rewind to the summary.
   */
  shiftAfterCompaction(keepFrom: number): void {
    for (const t of this.turns) t.messageCount = Math.max(1, t.messageCount - keepFrom + 1);
    this.save();
  }

  /** Undoes the last `n` turns. Returns undefined when there is nothing to undo. */
  rewind(n = 1): RewindResult | undefined {
    const count = Math.min(Math.max(1, n), this.turns.length);
    if (!this.turns.length) return undefined;
    const undone = this.turns.splice(this.turns.length - count, count);
    const restored: string[] = [];
    const deleted: string[] = [];
    for (const turn of [...undone].reverse()) {
      for (const file of [...turn.files].reverse()) {
        if (file.backup === null) {
          rmSync(file.path, { force: true });
          deleted.push(file.path);
        } else {
          mkdirSync(dirname(file.path), { recursive: true });
          copyFileSync(join(this.dir, file.backup), file.path);
          rmSync(join(this.dir, file.backup), { force: true });
          restored.push(file.path);
        }
      }
    }
    this.save();
    return { turns: undone, restored, deleted, messageCount: undone[0]?.messageCount ?? 0 };
  }

  private save(): void {
    writeFileSync(join(this.dir, "index.json"), JSON.stringify(this.turns), { mode: 0o600 });
  }
}
