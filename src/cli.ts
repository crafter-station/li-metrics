#!/usr/bin/env bun

import { Command } from "commander";
import {
  readAgentBrowserVersion,
  runAgentBrowser,
  supportsAgentBrowserVersion,
} from "./agent-browser";
import { capturePost, captureWeek } from "./browser-provider";
import { importXlsxBatch } from "./import-workflow";
import { emit, emitError } from "./output";
import {
  defaultReceiptDirectory,
  listReceipts,
  loadReceipt,
  writeReceipt,
} from "./receipts";
import { reconcileReceipts } from "./reconcile";
import { operationSchemas } from "./schemas";
import type { BrowserConfig, WeeklyCapture } from "./types";

type GlobalOptions = {
  json?: boolean;
  ndjson?: boolean;
  cdp: string;
  timeout: string;
  receiptDir: string;
};

function globals(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}

function browserConfig(options: GlobalOptions): BrowserConfig {
  const cdpPort = Number.parseInt(options.cdp, 10);
  const timeoutMs = Number.parseInt(options.timeout, 10);
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
  const top = ranked[0];
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

const program = new Command()
  .name("li-metrics")
  .description(
    "Read-only LinkedIn post analytics through an authenticated browser",
  )
  .option("--json", "emit compact JSON")
  .option("--ndjson", "emit one JSON object per line")
  .option("--cdp <port>", "Dia remote debugging port", "9222")
  .option("--timeout <milliseconds>", "browser command timeout", "20000")
  .option(
    "--receipt-dir <path>",
    "append-only receipt directory",
    defaultReceiptDirectory(),
  );

program
  .command("doctor")
  .description("check the browser bridge and LinkedIn session")
  .action(async (_options, command) => {
    try {
      const options = globals(command);
      const config = browserConfig(options);
      const binary =
        process.env.LI_METRICS_AGENT_BROWSER_BIN ?? "agent-browser";
      const executable = Bun.which(binary);
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
        cdp = (await fetch(`http://127.0.0.1:${config.cdpPort}/json/version`, {
          signal: AbortSignal.timeout(config.timeoutMs),
        }).then((response) => response.json())) as { Browser?: string };
      } catch {}
      let tabs = "";
      if (executable && cdp) {
        tabs = await runAgentBrowser(config, ["tab", "list"]);
      }
      const ok = Boolean(
        executable &&
          agentBrowserSupported &&
          cdp &&
          /linkedin\.com/i.test(tabs),
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
        process.exitCode = 1;
      }
    } catch (error) {
      emitError(error);
    }
  });

program
  .command("schema")
  .description("print machine-readable operation schemas")
  .argument("[operation]")
  .action((operation: string | undefined, _options, command) => {
    try {
      const output = operation
        ? operationSchemas[operation as keyof typeof operationSchemas]
        : operationSchemas;
      if (!output) {
        throw new Error(`Unknown operation: ${operation}`);
      }
      emit(output, globals(command));
    } catch (error) {
      emitError(error);
    }
  });

const posts = program.command("posts");
posts
  .command("week")
  .description("list posts visible in the 7-day analytics dashboard")
  .option("--days <days>", "dashboard period", "7")
  .option("--no-details", "skip individual analytics pages")
  .action(async (options: { days: string; details: boolean }, command) => {
    try {
      if (options.days !== "7") {
        throw new Error("V0 supports only the LinkedIn 7-day dashboard period");
      }
      const globalOptions = globals(command);
      emit(
        await captureWeek(browserConfig(globalOptions), options.details),
        globalOptions,
      );
    } catch (error) {
      emitError(error);
    }
  });

const post = program.command("post");
post
  .command("metrics")
  .description("capture metrics for a LinkedIn post link or URN")
  .argument("<post>")
  .action(async (input: string, _options, command) => {
    try {
      const options = globals(command);
      emit(await capturePost(browserConfig(options), input), options);
    } catch (error) {
      emitError(error);
    }
  });

const checkpoint = program.command("checkpoint");
checkpoint
  .command("capture")
  .description("capture and persist an append-only metric receipt")
  .argument("<post>")
  .option("--dry-run", "capture without writing")
  .action(
    async (input: string, local: { dryRun?: boolean }, command: Command) => {
      try {
        const options = globals(command);
        const receipt = await capturePost(browserConfig(options), input);
        const path = local.dryRun
          ? null
          : await writeReceipt(receipt, options.receiptDir);
        emit({ receipt, path }, options);
      } catch (error) {
        emitError(error);
      }
    },
  );

const importCommand = program.command("import");
importCommand
  .command("xlsx")
  .description("import one or more LinkedIn single-post XLSX exports")
  .argument("<files...>")
  .option("--dry-run", "parse without writing receipts")
  .action(
    async (files: string[], local: { dryRun?: boolean }, command: Command) => {
      try {
        const options = globals(command);
        emit(
          await importXlsxBatch(files, {
            dryRun: Boolean(local.dryRun),
            receiptDirectory: options.receiptDir,
          }),
          options,
        );
      } catch (error) {
        emitError(error);
      }
    },
  );

program
  .command("reconcile")
  .description("compare receipt files without overwriting history")
  .argument("<files...>")
  .action(async (files: string[], _options, command) => {
    try {
      const options = globals(command);
      emit(
        reconcileReceipts(await Promise.all(files.map(loadReceipt))),
        options,
      );
    } catch (error) {
      emitError(error);
    }
  });

const brief = program.command("brief");
brief
  .command("week")
  .description("produce a conservative weekly decision brief")
  .action(async (_options, command) => {
    try {
      const options = globals(command);
      const capture = await captureWeek(browserConfig(options), true);
      emit({ ...briefFromCapture(capture), evidence: capture }, options);
    } catch (error) {
      emitError(error);
    }
  });

const receipt = program.command("receipt");
receipt
  .command("list")
  .description("list stored metric receipts")
  .action(async (_options, command) => {
    try {
      const options = globals(command);
      emit(await listReceipts(options.receiptDir), options);
    } catch (error) {
      emitError(error);
    }
  });

await program.parseAsync();
