import { describe, expect, test } from "bun:test";
import pc from "picocolors";
import {
  formatDoctor,
  formatReceipt,
  formatWeeklyCapture,
} from "../src/human-output";
import type { MetricReceipt, WeeklyCapture } from "../src/types";

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
});
