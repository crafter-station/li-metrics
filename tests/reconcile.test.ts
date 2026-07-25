import { describe, expect, test } from "bun:test";
import { reconcileReceipts } from "../src/reconcile";
import type { MetricReceipt } from "../src/types";

function receipt(
  id: string,
  observedAt: string,
  socialEngagements: number,
  post: MetricReceipt["post"] = { shareUrn: "urn:li:share:123" },
): MetricReceipt {
  return {
    receiptVersion: 1,
    receiptId: id,
    post,
    window: { kind: "lifetime" },
    metrics: { socialEngagements },
    provider: { name: "linkedin-dashboard", estimated: true },
    observedAt,
    provenance: { source: "test" },
    warnings: [],
  };
}

describe("receipt reconciliation", () => {
  test("detects a downward LinkedIn revision", () => {
    const result = reconcileReceipts([
      receipt("old", "2026-07-25T10:00:00.000Z", 103),
      receipt("new", "2026-07-25T11:00:00.000Z", 75),
    ])[0];

    expect(result?.revisionDetected).toBe(true);
    expect(result?.differences).toEqual([
      {
        metric: "socialEngagements",
        from: 103,
        to: 75,
        delta: -28,
        direction: "down",
      },
    ]);
  });

  test("joins share and activity receipts through a bridge identity", () => {
    const results = reconcileReceipts([
      receipt("xlsx", "2026-07-25T09:00:00.000Z", 103, {
        shareUrn: "urn:li:share:123",
      }),
      receipt("bridge", "2026-07-25T10:00:00.000Z", 90, {
        shareUrn: "urn:li:share:123",
        activityUrn: "urn:li:activity:456",
      }),
      receipt("dashboard", "2026-07-25T11:00:00.000Z", 75, {
        activityUrn: "urn:li:activity:456",
      }),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.identity).toEqual({
      shareUrn: "urn:li:share:123",
      activityUrn: "urn:li:activity:456",
    });
    expect(results[0]?.receiptIds).toEqual(["xlsx", "bridge", "dashboard"]);
    expect(results[0]?.revisionDetected).toBe(true);
  });
});
