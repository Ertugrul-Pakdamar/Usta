import { describe, expect, it } from "vitest";
import { configFromEnv } from "./config.js";

describe("configFromEnv", () => {
  it("uses defaults and trims trailing slashes", () => {
    const c = configFromEnv({ EVREN_BASE_URL: "https://x/v1/" });
    expect(c.baseUrl).toBe("https://x/v1");
    expect(c.model).toBe("qwen3-vl-30b");
    expect(c.maxTokens).toBeUndefined();
  });

  it("has no built-in gateway address", () => {
    expect(configFromEnv({}).baseUrl).toBe("");
  });

  it("reads an optional frequency penalty and leaves it unset otherwise", () => {
    expect(configFromEnv({ EVREN_FREQUENCY_PENALTY: "0.3" }).frequencyPenalty).toBe(0.3);
    expect(configFromEnv({ EVREN_FREQUENCY_PENALTY: "x" }).frequencyPenalty).toBeUndefined();
    expect("frequencyPenalty" in configFromEnv({})).toBe(false);
  });
});

describe("loadEnvFiles", () => {
  it("loads ./.env without overriding real variables", async () => {
    const { mkdtemp, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { loadEnvFiles } = await import("./config.js");
    const dir = await mkdtemp(join(tmpdir(), "usta-"));
    await writeFile(join(dir, ".env"), "USTA_T_A=file\nUSTA_T_B=file\n");
    process.env.USTA_T_A = "real";
    loadEnvFiles(dir, dir);
    expect(process.env.USTA_T_A).toBe("real");
    expect(process.env.USTA_T_B).toBe("file");
  });
});
