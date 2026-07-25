import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listReceipts, loadReceipt, writeReceipt } from "../src/receipts";
import type { MetricReceipt } from "../src/types";
import { parseMetricReceipt } from "../src/validation";

const directories: string[] = [];

afterAll(async () => {
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true })),
  );
});

function fixture(): MetricReceipt {
  return {
    receiptVersion: 1,
    receiptId: "a".repeat(64),
    post: { shareUrn: "urn:li:share:123" },
    window: { kind: "lifetime" },
    metrics: { impressions: 10, linkClicks: undefined },
    provider: { name: "linkedin-dashboard", estimated: true },
    observedAt: "2026-07-25T10:00:00.000Z",
    provenance: { source: "fixture" },
    warnings: [],
  };
}

describe("receipt storage", () => {
  test("writes idempotently and lists only validated receipts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "li-metrics-receipts-"));
    directories.push(directory);
    const receipt = fixture();
    const first = await writeReceipt(receipt, directory);
    const second = await writeReceipt(receipt, directory);
    const listed = await listReceipts(directory);

    expect(second).toBe(first);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.receipt.receiptId).toBe(receipt.receiptId);
    expect("linkClicks" in (listed[0]?.receipt.metrics ?? {})).toBe(false);
  });

  test("rejects malformed receipts before reconciliation", () => {
    expect(() => parseMetricReceipt({})).toThrow("Unsupported receipt version");
  });

  test("rejects oversized receipt files before JSON parsing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "li-metrics-receipts-"));
    directories.push(directory);
    const path = join(directory, "oversized.json");
    await Bun.write(path, new Uint8Array(5 * 1024 * 1024 + 1));

    await expect(loadReceipt(path)).rejects.toThrow(
      "Receipt exceeds size limit",
    );
  });
});
