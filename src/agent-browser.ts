import type { BrowserConfig } from "./types";

export class BrowserCommandError extends Error {
  constructor(
    message: string,
    readonly command: string[],
    readonly stderr: string,
  ) {
    super(message);
    this.name = "BrowserCommandError";
  }
}

export function supportsAgentBrowserVersion(version: string): boolean {
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return false;
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (major !== 0 || minor < 31 || minor >= 34) {
    return false;
  }
  return minor > 31 || patch >= 1;
}

export async function readAgentBrowserVersion(
  binary: string,
  timeoutMs: number,
): Promise<string> {
  const processHandle = Bun.spawn([binary, "--version"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const exitCode = await Promise.race([
      processHandle.exited,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          processHandle.kill();
          reject(new Error("agent-browser version check timed out"));
        }, timeoutMs);
      }),
    ]);
    const output = await new Response(processHandle.stdout).text();
    if (exitCode !== 0) {
      throw new Error("agent-browser version check failed");
    }
    return output.trim();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export async function runAgentBrowser(
  config: BrowserConfig,
  args: string[],
  stdin?: string,
): Promise<string> {
  const binary =
    config.binary ??
    process.env.LI_METRICS_AGENT_BROWSER_BIN ??
    "agent-browser";
  const command = [
    binary,
    "--namespace",
    config.namespace ?? "li-metrics",
    "--cdp",
    String(config.cdpPort),
    ...args,
  ];
  const processHandle = Bun.spawn(command, {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  });
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    const exitCode = await Promise.race([
      processHandle.exited,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          processHandle.kill();
          reject(
            new BrowserCommandError(
              `Browser command timed out after ${config.timeoutMs}ms`,
              command,
              "",
            ),
          );
        }, config.timeoutMs);
      }),
    ]);
    const [stdout, stderr] = await Promise.all([
      new Response(processHandle.stdout).text(),
      new Response(processHandle.stderr).text(),
    ]);

    if (exitCode !== 0) {
      throw new BrowserCommandError(
        stderr.trim() || `Browser command exited with code ${exitCode}`,
        command,
        stderr.trim(),
      );
    }

    return stdout.trim();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

export class BrowserPage {
  readonly label = `li-metrics-${process.pid}-${Date.now()}`;

  constructor(readonly config: BrowserConfig) {}

  async start(url: string): Promise<void> {
    await runAgentBrowser(this.config, [
      "tab",
      "new",
      "--label",
      this.label,
      url,
    ]);
  }

  async select(): Promise<void> {
    await runAgentBrowser(this.config, ["tab", this.label]);
  }

  async goto(url: string): Promise<void> {
    await this.select();
    await runAgentBrowser(this.config, ["open", url]);
  }

  async waitForText(text: string): Promise<void> {
    await this.select();
    await runAgentBrowser(this.config, ["wait", "--text", text]);
  }

  async waitForFunction(script: string): Promise<void> {
    await this.select();
    await runAgentBrowser(this.config, ["wait", "--fn", script]);
  }

  async evaluate<T>(script: string): Promise<T> {
    await this.select();
    const output = await runAgentBrowser(
      this.config,
      ["eval", "--stdin"],
      script,
    );
    return JSON.parse(output) as T;
  }

  async snapshot(): Promise<void> {
    await this.select();
    await runAgentBrowser(this.config, ["snapshot", "-i"]);
  }

  async find(args: string[]): Promise<void> {
    await this.select();
    await runAgentBrowser(this.config, ["find", ...args]);
  }

  async findAny(candidates: string[][]): Promise<void> {
    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        await this.find(candidate);
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError ?? new Error("No browser locator candidate matched");
  }

  async scrollDown(pixels: number): Promise<void> {
    await this.select();
    await runAgentBrowser(this.config, ["scroll", "down", String(pixels)]);
  }

  async close(): Promise<void> {
    try {
      await this.select();
      await runAgentBrowser(this.config, ["tab", "close"]);
    } catch {}
  }
}
