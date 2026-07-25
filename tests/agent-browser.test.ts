import { afterAll, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BrowserCommandError,
  runAgentBrowser,
  supportsAgentBrowserVersion,
} from "../src/agent-browser";

const directories: string[] = [];

afterAll(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true })),
  );
});

describe("agent-browser process boundary", () => {
  test("enforces the supported version range", () => {
    expect(supportsAgentBrowserVersion("agent-browser 0.31.1")).toBe(true);
    expect(supportsAgentBrowserVersion("agent-browser 0.33.9")).toBe(true);
    expect(supportsAgentBrowserVersion("agent-browser 0.31.0")).toBe(false);
    expect(supportsAgentBrowserVersion("agent-browser 0.34.0")).toBe(false);
    expect(supportsAgentBrowserVersion("unknown")).toBe(false);
  });

  test("kills a browser command that exceeds its timeout", async () => {
    const directory = await mkdtemp(join(tmpdir(), "li-metrics-browser-"));
    directories.push(directory);
    const executable = join(directory, "slow-browser");
    await Bun.write(
      executable,
      "#!/usr/bin/env bun\nawait Bun.sleep(10_000);\n",
    );
    await chmod(executable, 0o755);
    const startedAt = Date.now();

    await expect(
      runAgentBrowser(
        {
          cdpPort: 9222,
          timeoutMs: 50,
          namespace: "timeout-test",
          binary: executable,
        },
        ["tab", "list"],
      ),
    ).rejects.toBeInstanceOf(BrowserCommandError);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});
