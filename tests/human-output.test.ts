import { describe, expect, test } from "bun:test";
import pc from "picocolors";
import {
  formatBackfill,
  formatCohort,
  formatDoctor,
  formatReceipt,
  formatTrend,
  formatWeeklyCapture,
} from "../src/human-output";
import type {
  CohortReport,
  MetricReceipt,
  TrendReport,
  WeeklyCapture,
} from "../src/types";

const receipt: MetricReceipt = {
  receiptVersion: 1,
  receiptId: "receipt-1",
  post: {
    shareUrn: "urn:li:share:123",
    publicUrl: "https://www.linkedin.com/feed/update/urn:li:share:123",
    commentary: "Anthropic acaba de publicar algo que suena a ciencia ficción",
  },
  window: { kind: "lifetime", label: "Lifetime" },
  metrics: {
    impressions: 120164,
    socialEngagements: 637,
    saves: 174,
    sends: 11,
    outOfNetworkPercent: 98,
  },
  provider: { name: "linkedin-dashboard", estimated: true },
  observedAt: "2026-07-25T12:00:00.000Z",
  provenance: { source: "linkedin-post-analytics" },
  warnings: [],
};

const capture: WeeklyCapture = {
  period: { days: 7, label: "Last 7 days" },
  posts: [
    {
      commentary: receipt.post.commentary ?? "",
      cardText: "120K impressions",
      publicUrl: receipt.post.publicUrl,
    },
  ],
  receipts: [receipt],
  observedAt: receipt.observedAt,
  warnings: [],
};

describe("human output", () => {
  test("summarizes a weekly capture without dumping commentary payloads", () => {
    const output = formatWeeklyCapture(capture, pc.createColors(false));

    expect(output).toContain("LinkedIn posts Last 7 days");
    expect(output).toContain("1 posts · 120,164 impressions · 637 engagements");
    expect(output).toContain("174 saves");
    expect(output.length).toBeLessThan(700);
  });

  test("formats a detailed receipt and percentages", () => {
    const output = formatReceipt(receipt, pc.createColors(false));

    expect(output).toContain("Impressions              120,164");
    expect(output).toContain("Out of network           98%");
    expect(output).toContain("linkedin-dashboard");
  });

  test("uses picocolors when color support is enabled", () => {
    const output = formatDoctor(
      {
        ok: true,
        agentBrowser: {
          executable: "/bin/agent-browser",
          version: "0.31.1",
          supported: true,
          supportedRange: ">=0.31.1 <0.34.0",
        },
        cdp: { connected: true, browser: "Dia", port: 9222 },
        linkedinSessionVisible: true,
      },
      pc.createColors(true),
    );

    expect(output).toContain("\u001b[");
    expect(output).toContain("li-metrics is ready");
  });

  test("formats batch, trend, and cohort reports for humans", () => {
    const colors = pc.createColors(false);
    const backfill = formatBackfill(
      [
        { input: "post-a", ok: true, receipt, path: "/tmp/receipt.json" },
        { input: "post-b", ok: false, error: "not found" },
      ],
      colors,
    );
    const trendReport: TrendReport = {
      generatedAt: receipt.observedAt,
      postCount: 1,
      comparablePostCount: 1,
      insufficientHistoryCount: 0,
      trends: [
        {
          identity: receipt.post,
          receiptCount: 2,
          firstObservedAt: "2026-07-24T12:00:00.000Z",
          latestObservedAt: receipt.observedAt,
          elapsedDays: 1,
          differences: [
            {
              metric: "impressions",
              from: 100000,
              to: 120164,
              delta: 20164,
              direction: "up",
            },
          ],
          revisionDetected: false,
        },
      ],
    };
    const cohortReport: CohortReport = {
      generatedAt: receipt.observedAt,
      since: "2026-07-01",
      postCount: 1,
      totals: receipt.metrics,
      averages: receipt.metrics,
      posts: [
        {
          identity: receipt.post,
          publishedAt: "2026-07-14T12:00:00.000Z",
          observedAt: receipt.observedAt,
          receiptId: receipt.receiptId,
          metrics: receipt.metrics,
          rates: {
            engagement: 0.53,
            profileView: 0.09,
            followerConversion: 0.04,
            save: 0.14,
          },
        },
      ],
    };

    expect(backfill).toContain("Backfilled 1/2");
    expect(backfill).toContain("1 post(s) failed");
    expect(formatTrend(trendReport, colors)).toContain("+20,164");
    expect(formatCohort(cohortReport, colors)).toContain("engagement 0.53%");
  });
});
