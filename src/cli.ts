#!/usr/bin/env bun

import { get } from "node:http";
import {
  readAgentBrowserVersion,
  runAgentBrowser,
  supportsAgentBrowserVersion,
} from "./agent-browser";
import { capturePost, captureWeek } from "./browser-provider";
import {
  type CliOptions,
  helpText,
  type ParsedCli,
  parseCliArgs,
} from "./cli-parser";
import { importXlsxBatch } from "./import-workflow";
import { emit, emitArray, emitError } from "./output";
import {
  defaultReceiptDirectory,
  listReceipts,
  loadReceipt,
  writeReceipt,
} from "./receipts";
import { reconcileReceipts } from "./reconcile";
import { findExecutable } from "./runtime";
import { operationSchemas } from "./schemas";
import type { BrowserConfig, MetricReceipt, WeeklyCapture } from "./types";

function browserConfig(options: CliOptions): BrowserConfig {
  const cdpPort = parseInt(options.cdp, 10);
  const timeoutMs = parseInt(options.timeout, 10);
  if (!Number.isFinite(cdpPort) || cdpPort < 1) {
    throw new Error(`Invalid CDP port: ${options.cdp}`);
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new Error(`Invalid timeout: ${options.timeout}`);
  }
  return { cdpPort, timeoutMs, namespace: "li-metrics" };
}

function briefFromCapture(capture: WeeklyCapture): {
  facts: string[];
  unknowns: string[];
  actions: string[];
} {
  const totals = capture.receipts.reduce(
    (sum, receipt) => ({
      impressions: sum.impressions + (receipt.metrics.impressions ?? 0),
      engagements: sum.engagements + (receipt.metrics.socialEngagements ?? 0),
      saves: sum.saves + (receipt.metrics.saves ?? 0),
      sends: sum.sends + (receipt.metrics.sends ?? 0),
    }),
    { impressions: 0, engagements: 0, saves: 0, sends: 0 },
  );
  const ranked = [...capture.receipts].sort(
    (left, right) =>
      (right.metrics.socialEngagements ?? 0) -
      (left.metrics.socialEngagements ?? 0),
  );
  const top = ranked.length > 0 ? ranked[0] : undefined;
  const topLabel =
    top?.post.commentary?.split(/\r?\n/)[0]?.slice(0, 90) ?? "unknown";

  return {
    facts: [
      `${capture.posts.length} posts appeared in the selected 7-day dashboard.`,
      `${totals.impressions} lifetime impressions and ${totals.engagements} lifetime social engagements were visible at capture time.`,
      `The highest visible social engagement count was ${top?.metrics.socialEngagements ?? 0}: ${topLabel}`,
      `${totals.saves} saves and ${totals.sends} LinkedIn sends were visible across the captured posts.`,
    ],
    unknowns: [
      "The dashboard detail values are lifetime snapshots, not isolated 7-day attribution.",
      "LinkedIn may revise counts after publication, so causal claims require checkpoints.",
    ],
    actions: [
      "Repeat the strongest topic or format with a new angle.",
      "Capture each new post at consistent checkpoints to separate growth from revisions.",
      "Use saves and sends as the main depth signal before optimizing outbound links.",
    ],
  };
}

function positional(
  values: string[],
  index: number,
  description: string,
): string {
  if (index >= values.length) {
    throw new Error(`Missing argument: ${description}`);
  }
  const value = values[index];
  if (value === undefined) {
    throw new Error(`Missing argument: ${description}`);
  }
  return value;
}

function exactLength(values: string[], expected: number): void {
  if (values.length > expected) {
    const unexpected = values[expected];
    throw new Error(`Unexpected argument: ${unexpected ?? "unknown"}`);
  }
}

function requestedHelpPath(positionals: string[]): string[] {
  let values = positionals;
  if (values.length > 0 && values[0] === "help") {
    values = values.slice(1);
  }
  if (values.length === 0) {
    return [];
  }
  const first = values[0];
  if (
    first === "posts" ||
    first === "post" ||
    first === "checkpoint" ||
    first === "import" ||
    first === "brief" ||
    first === "receipt"
  ) {
    return values.slice(0, 2);
  }
  return values.slice(0, 1);
}

function emitSchema(operation: string | undefined, options: CliOptions): void {
  if (operation === undefined) {
    emit(operationSchemas, options);
  } else if (operation === "posts.week") {
    emit(operationSchemas["posts.week"], options);
  } else if (operation === "post.metrics") {
    emit(operationSchemas["post.metrics"], options);
  } else if (operation === "checkpoint.capture") {
    emit(operationSchemas["checkpoint.capture"], options);
  } else if (operation === "import.xlsx") {
    emit(operationSchemas["import.xlsx"], options);
  } else if (operation === "reconcile") {
    emit(operationSchemas.reconcile, options);
  } else if (operation === "brief.week") {
    emit(operationSchemas["brief.week"], options);
  } else {
    throw new Error(`Unknown operation: ${operation}`);
  }
}

async function runDoctor(options: CliOptions): Promise<void> {
  const config = browserConfig(options);
  const binary = process.env.LI_METRICS_AGENT_BROWSER_BIN ?? "agent-browser";
  const executable = findExecutable(binary);
  let agentBrowserVersion: string | undefined;
  if (executable) {
    try {
      agentBrowserVersion = await readAgentBrowserVersion(
        executable,
        config.timeoutMs,
      );
    } catch {}
  }
  const agentBrowserSupported = agentBrowserVersion
    ? supportsAgentBrowserVersion(agentBrowserVersion)
    : false;
  let cdp: { Browser?: string } | undefined;
  try {
    cdp = await readCdpVersion(config.cdpPort, config.timeoutMs);
  } catch {}
  let tabs = "";
  if (executable && cdp) {
    tabs = await runAgentBrowser(config, ["tab", "list"]);
  }
  const ok = Boolean(
    executable && agentBrowserSupported && cdp && /linkedin\.com/i.test(tabs),
  );
  emit(
    {
      ok,
      agentBrowser: {
        executable,
        version: agentBrowserVersion,
        supported: agentBrowserSupported,
        supportedRange: ">=0.31.1 <0.34.0",
      },
      cdp: {
        connected: Boolean(cdp),
        browser: cdp?.Browser,
        port: config.cdpPort,
      },
      linkedinSessionVisible: /linkedin\.com/i.test(tabs),
    },
    options,
  );
  if (!ok) {
    process.exit(1);
  }
}

function readCdpVersion(
  port: number,
  timeoutMs: number,
): Promise<{ Browser?: string }> {
  return new Promise((resolve, reject) => {
    const request = get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/json/version",
        agent: false,
        timeout: timeoutMs,
      },
      (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        response.on("end", () => {
          try {
            const statusCode = response.statusCode ?? 500;
            if (statusCode >= 400) {
              throw new Error(`CDP version endpoint returned ${statusCode}`);
            }
            resolve(JSON.parse(body) as { Browser?: string });
          } catch (error) {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
      },
    );
    request.on("timeout", () => {
      request.destroy();
      reject(new Error(`CDP version check timed out after ${timeoutMs}ms`));
    });
    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function runCli(parsed: ParsedCli): Promise<void> {
  const values = parsed.positionals;
  if (
    values.length === 0 ||
    parsed.help ||
    (values.length > 0 && values[0] === "help")
  ) {
    process.stdout.write(
      `${helpText(requestedHelpPath(values), parsed.options.receiptDir)}\n`,
    );
    return;
  }

  const command = positional(values, 0, "command");
  if (command === "doctor") {
    exactLength(values, 1);
    await runDoctor(parsed.options);
    return;
  }
  if (command === "schema") {
    exactLength(values, 2);
    emitSchema(values.length > 1 ? values[1] : undefined, parsed.options);
    return;
  }
  if (command === "posts" && positional(values, 1, "subcommand") === "week") {
    exactLength(values, 2);
    if (parsed.days !== "7") {
      throw new Error("V0 supports only the LinkedIn 7-day dashboard period");
    }
    emit(
      await captureWeek(browserConfig(parsed.options), parsed.details),
      parsed.options,
    );
    return;
  }
  if (command === "post" && positional(values, 1, "subcommand") === "metrics") {
    const input = positional(values, 2, "post");
    exactLength(values, 3);
    emit(
      await capturePost(browserConfig(parsed.options), input),
      parsed.options,
    );
    return;
  }
  if (
    command === "checkpoint" &&
    positional(values, 1, "subcommand") === "capture"
  ) {
    const input = positional(values, 2, "post");
    exactLength(values, 3);
    const receipt = await capturePost(browserConfig(parsed.options), input);
    const path = parsed.dryRun
      ? null
      : await writeReceipt(receipt, parsed.options.receiptDir);
    emit({ receipt, path }, parsed.options);
    return;
  }
  if (command === "import" && positional(values, 1, "subcommand") === "xlsx") {
    const files = values.slice(2);
    if (files.length === 0) {
      throw new Error("Missing argument: files");
    }
    emitArray(
      await importXlsxBatch(files, {
        dryRun: parsed.dryRun,
        receiptDirectory: parsed.options.receiptDir,
      }),
      parsed.options,
    );
    return;
  }
  if (command === "reconcile") {
    const files = values.slice(1);
    if (files.length === 0) {
      throw new Error("Missing argument: files");
    }
    const receipts: MetricReceipt[] = [];
    for (const file of files) {
      receipts.push(await loadReceipt(file));
    }
    emitArray(reconcileReceipts(receipts), parsed.options);
    return;
  }
  if (command === "brief" && positional(values, 1, "subcommand") === "week") {
    exactLength(values, 2);
    const capture = await captureWeek(browserConfig(parsed.options), true);
    const brief = briefFromCapture(capture);
    emit(
      {
        facts: brief.facts,
        unknowns: brief.unknowns,
        actions: brief.actions,
        evidence: capture,
      },
      parsed.options,
    );
    return;
  }
  if (command === "receipt" && positional(values, 1, "subcommand") === "list") {
    exactLength(values, 2);
    emitArray(await listReceipts(parsed.options.receiptDir), parsed.options);
    return;
  }
  throw new Error(`Unknown command: ${values.join(" ")}`);
}

async function main(): Promise<void> {
  try {
    await runCli(
      parseCliArgs(process.argv.slice(2), defaultReceiptDirectory()),
    );
  } catch (error) {
    emitError(error instanceof Error ? error.message : String(error));
  }
}

main();
