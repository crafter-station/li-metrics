import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

const cliPath = resolve(import.meta.dir, "../src/cli.ts");

async function runCli(
  args: string[],
  env?: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const processHandle = Bun.spawn(["bun", cliPath, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    processHandle.exited,
    new Response(processHandle.stdout).text(),
    new Response(processHandle.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

describe("CLI process contracts", () => {
  test("prints help without loading the browser bridge", async () => {
    const result = await runCli(["--help"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Usage: li-metrics");
    expect(result.stderr).toBe("");
  });

  test("doctor exits nonzero when its checks fail", async () => {
    const result = await runCli(["doctor", "--cdp", "1", "--json"], {
      LI_METRICS_AGENT_BROWSER_BIN: "definitely-missing-agent-browser",
    });

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: false });
    expect(result.stderr).toBe("");
  });

  test("schema output is machine-readable after package execution", async () => {
    const result = await runCli(["schema", "post.metrics", "--json"]);
    const schema = JSON.parse(result.stdout);

    expect(result.exitCode).toBe(0);
    expect(schema.output.$ref).toBe("#/$defs/MetricReceipt");
    expect(schema.$defs.MetricReceipt).toBeDefined();
  });

  test("reports parser failures as machine-readable errors", async () => {
    const result = await runCli(["schema", "--wat"]);

    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: { code: "LI_METRICS_ERROR", message: "Unknown option: --wat" },
    });
  });
});
