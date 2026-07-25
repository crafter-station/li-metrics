import { writeReceipt } from "./receipts";
import type { MetricReceipt } from "./types";
import { importXlsx } from "./xlsx-provider";

export type ImportBatchResult = {
  receipt: MetricReceipt;
  path: string | null;
};

export async function importXlsxBatch(
  files: string[],
  options: {
    dryRun: boolean;
    receiptDirectory: string;
  },
): Promise<ImportBatchResult[]> {
  const receipts = await Promise.all(files.map((file) => importXlsx(file)));

  if (options.dryRun) {
    return receipts.map((receipt) => ({ receipt, path: null }));
  }

  const paths = await Promise.all(
    receipts.map((receipt) => writeReceipt(receipt, options.receiptDirectory)),
  );
  return receipts.map((receipt, index) => ({
    receipt,
    path: paths[index] ?? null,
  }));
}

export async function importXlsxBatchWith(
  files: string[],
  options: {
    dryRun: boolean;
    receiptDirectory: string;
    importer: (path: string) => Promise<MetricReceipt>;
    writer: (receipt: MetricReceipt, directory: string) => Promise<string>;
  },
): Promise<ImportBatchResult[]> {
  const receipts = await Promise.all(
    files.map((file) => options.importer(file)),
  );
  if (options.dryRun) {
    return receipts.map((receipt) => ({ receipt, path: null }));
  }
  const paths = await Promise.all(
    receipts.map((receipt) =>
      options.writer(receipt, options.receiptDirectory),
    ),
  );
  return receipts.map((receipt, index) => ({
    receipt,
    path: paths[index] ?? null,
  }));
}
