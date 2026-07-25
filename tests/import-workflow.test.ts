import { describe, expect, test } from "bun:test";
import { importXlsxBatchWith } from "../src/import-workflow";
import type { MetricReceipt } from "../src/types";

const receipt: MetricReceipt = {
  receiptVersion: 1,
  receiptId: "receipt",
  post: { shareUrn: "urn:li:share:123" },
  window: { kind: "xlsx-export" },
  metrics: { impressions: 10 },
  provider: { name: "linkedin-xlsx", estimated: true },
  observedAt: "2026-07-25T10:00:00.000Z",
  provenance: { source: "fixture" },
  warnings: [],
};

describe("XLSX batch import", () => {
  test("parses every file before starting durable writes", async () => {
    let writes = 0;
    const importer = async (path: string) => {
      if (path === "broken.xlsx") {
        throw new Error("broken fixture");
      }
      return receipt;
    };
    const writer = async () => {
      writes += 1;
      return "/tmp/receipt.json";
    };

    await expect(
      importXlsxBatchWith(["valid.xlsx", "broken.xlsx"], {
        dryRun: false,
        receiptDirectory: "/tmp",
        importer,
        writer,
      }),
    ).rejects.toThrow("broken fixture");
    expect(writes).toBe(0);
  });
});
