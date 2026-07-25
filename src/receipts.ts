import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { MetricReceipt } from "./types";
import { parseMetricReceipt } from "./validation";

const maxReceiptBytes = 5 * 1024 * 1024;

export function defaultReceiptDirectory(): string {
  return join(homedir(), ".local", "share", "li-metrics", "receipts");
}

export async function writeReceipt(
  receipt: MetricReceipt,
  directory: string,
): Promise<string> {
  parseMetricReceipt(receipt);
  const absoluteDirectory = resolve(directory);
  mkdirSync(absoluteDirectory, { recursive: true });
  const timestamp = receipt.observedAt.replace(/[:.]/g, "-");
  const path = join(
    absoluteDirectory,
    `${timestamp}-${receipt.receiptId.slice(0, 12)}.json`,
  );
  const temporaryPath = join(
    absoluteDirectory,
    `.receipt-${receipt.receiptId}-${process.pid}-${randomUUID()}.tmp`,
  );

  writeFileSync(temporaryPath, `${JSON.stringify(receipt)}\n`);
  chmodSync(temporaryPath, 0o600);
  execFileSync(
    "/bin/sync",
    [process.platform === "linux" ? "-d" : "-f", temporaryPath],
    {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  try {
    execFileSync("/bin/ln", [temporaryPath, path], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (error) {
    if (!existsSync(path)) {
      throw error;
    }
  } finally {
    if (existsSync(temporaryPath)) {
      unlinkSync(temporaryPath);
    }
  }

  try {
    appendFileSync(
      join(absoluteDirectory, "audit.jsonl"),
      `${JSON.stringify({
        action: "receipt.capture",
        at: new Date().toISOString(),
        path,
        receiptId: receipt.receiptId,
      })}\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Receipt saved at ${path}, but audit append failed: ${message}`,
    );
  }
  return path;
}

export async function loadReceipt(path: string): Promise<MetricReceipt> {
  const absolutePath = resolve(path);
  const fileStat = statSync(absolutePath);
  if (fileStat.size > maxReceiptBytes) {
    throw new Error(`Receipt exceeds size limit of ${maxReceiptBytes} bytes`);
  }
  return parseMetricReceipt(JSON.parse(readFileSync(absolutePath, "utf8")));
}

export async function listReceipts(
  directory: string,
): Promise<Array<{ path: string; receipt: MetricReceipt }>> {
  const absoluteDirectory = resolve(directory);
  const receipts: Array<{ path: string; receipt: MetricReceipt }> = [];
  if (!existsSync(absoluteDirectory)) {
    return receipts;
  }
  const filenames = readdirSync(absoluteDirectory)
    .filter((name) => /^\d{4}-\d{2}-\d{2}T.*-[a-f0-9]{12}\.json$/.test(name))
    .sort();
  for (const filename of filenames) {
    const path = join(absoluteDirectory, filename);
    receipts.push({ path, receipt: await loadReceipt(path) });
  }
  return receipts;
}
