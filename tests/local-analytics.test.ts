import { describe, expect, test } from "bun:test";
import {
  buildCohortReport,
  buildTrendReport,
  parseSince,
  publishedAt,
} from "../src/local-analytics";
import type { MetricReceipt } from "../src/types";

function receipt(
  id: string,
  activityId: string,
  observedAt: string,
  metrics: MetricReceipt["metrics"],
  post: Partial<MetricReceipt["post"]> = {},
): MetricReceipt {
  return {
    receiptVersion: 1,
    receiptId: id,
    post: {
      activityUrn: `urn:li:activity:${activityId}`,
      ...post,
    },
    window: { kind: "lifetime" },
    metrics,
    provider: { name: "linkedin-dashboard", estimated: true },
    observedAt,
    provenance: { source: "test" },
    warnings: [],
  };
}

describe("local receipt analytics", () => {
  test("builds trends from repeated checkpoints and reports revisions", () => {
    const report = buildTrendReport(
      [
        receipt("first", "7483739171564679168", "2026-07-20T00:00:00.000Z", {
          impressions: 1000,
          socialEngagements: 35,
        }),
        receipt("latest", "7483739171564679168", "2026-07-22T00:00:00.000Z", {
          impressions: 1200,
          socialEngagements: 32,
        }),
        receipt("single", "7480700460182646784", "2026-07-21T00:00:00.000Z", {
          impressions: 2000,
        }),
      ],
      "2026-07-23T00:00:00.000Z",
    );

    expect(report).toMatchObject({
      postCount: 2,
      comparablePostCount: 1,
      insufficientHistoryCount: 1,
    });
    expect(report.trends[0]).toMatchObject({
      receiptCount: 2,
      elapsedDays: 2,
      revisionDetected: true,
    });
    expect(report.trends[0]?.differences).toEqual([
      {
        metric: "impressions",
        from: 1000,
        to: 1200,
        delta: 200,
        direction: "up",
      },
      {
        metric: "socialEngagements",
        from: 35,
        to: 32,
        delta: -3,
        direction: "down",
      },
    ]);
  });

  test("decodes publication time from LinkedIn snowflake URNs", () => {
    const value = receipt(
      "post",
      "7478126546625417218",
      "2026-07-26T00:00:00.000Z",
      { impressions: 3857 },
    );

    expect(publishedAt(value)).toBe("2026-07-01T16:45:05.588Z");
  });

  test("builds a cohort from latest receipts and computes rates", () => {
    const report = buildCohortReport(
      [
        receipt("old", "7478126546625417218", "2026-07-02T00:00:00.000Z", {
          impressions: 3000,
          socialEngagements: 50,
          followersGained: 3,
        }),
        receipt("latest", "7478126546625417218", "2026-07-26T00:00:00.000Z", {
          impressions: 4000,
          socialEngagements: 80,
          followersGained: 4,
          profileViews: 20,
          saves: 8,
        }),
        receipt("before", "7475000000000000000", "2026-07-26T00:00:00.000Z", {
          impressions: 9000,
        }),
      ],
      "2026-07-01",
      "2026-07-26T01:00:00.000Z",
    );

    expect(report.postCount).toBe(1);
    expect(report.totals).toMatchObject({
      impressions: 4000,
      socialEngagements: 80,
      followersGained: 4,
    });
    expect(report.posts[0]?.rates).toEqual({
      engagement: 2,
      profileView: 0.5,
      followerConversion: 0.1,
      save: 0.2,
    });
  });

  test("validates cohort dates", () => {
    expect(parseSince("2026-07-01")).toBe("2026-07-01T00:00:00.000Z");
    expect(() => parseSince("07/01/2026")).toThrow(
      "--since must use YYYY-MM-DD",
    );
    expect(() => parseSince("2026-99-99")).toThrow("Invalid --since date");
  });
});
