import {
  appendFile,
  link,
  mkdir,
  open,
  readdir,
  unlink,
} from "node:fs/promises";
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
  await mkdir(absoluteDirectory, { recursive: true });
  const timestamp = receipt.observedAt.replace(/[:.]/g, "-");
  const path = join(
    absoluteDirectory,
    `${timestamp}-${receipt.receiptId.slice(0, 12)}.json`,
  );

  const temporaryPath = join(
    absoluteDirectory,
    `.receipt-${receipt.receiptId}-${process.pid}-${crypto.randomUUID()}.tmp`,
  );
  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(receipt, null, 2)}\n`);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(temporaryPath, path);
  } catch (error) {
    if (
      !(error instanceof Error && "code" in error && error.code === "EEXIST")
    ) {
      throw error;
    }
  } finally {
    await unlink(temporaryPath).catch(() => undefined);
  }

  try {
    await appendFile(
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
  const stat = await Bun.file(absolutePath).stat();
  if (stat.size > maxReceiptBytes) {
    throw new Error(`Receipt exceeds size limit of ${maxReceiptBytes} bytes`);
  }
  return parseMetricReceipt(await Bun.file(absolutePath).json());
}

export async function listReceipts(
  directory: string,
): Promise<Array<{ path: string; receipt: MetricReceipt }>> {
  const absoluteDirectory = resolve(directory);
  try {
    const filenames = (await readdir(absoluteDirectory))
      .filter((name) => /^\d{4}-\d{2}-\d{2}T.*-[a-f0-9]{12}\.json$/.test(name))
      .sort();
    return await Promise.all(
      filenames.map(async (filename) => {
        const path = join(absoluteDirectory, filename);
        return { path, receipt: await loadReceipt(path) };
      }),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
