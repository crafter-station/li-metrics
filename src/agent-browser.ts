import { execFileSync } from "node:child_process";
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
  try {
    return execFileSync(binary, ["--version"], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }).trim();
  } catch {
    throw new Error("agent-browser version check failed");
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
  try {
    return execFileSync(binary, command.slice(1), {
      encoding: "utf8",
      input: stdin ?? "",
      timeout: config.timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    }).trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new BrowserCommandError(message, command, message);
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
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new Error(
      lastError === undefined
        ? "No browser locator candidate matched"
        : String(lastError),
    );
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
