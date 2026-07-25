import type { MetricReceipt, MetricValues } from "./types";

const metricNames = new Set<keyof MetricValues>([
  "impressions",
  "membersReached",
  "profileViews",
  "followersGained",
  "socialEngagements",
  "reactions",
  "comments",
  "reposts",
  "saves",
  "sends",
  "linkClicks",
  "linkEngagements",
  "premiumCtaEngagements",
  "inNetworkPercent",
  "outOfNetworkPercent",
]);

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid receipt field: ${field}`);
  }
  return value;
}

export function parseMetricReceipt(value: unknown): MetricReceipt {
  const receipt = object(value);
  if (receipt.receiptVersion !== 1) {
    throw new Error("Unsupported receipt version");
  }
  nonEmptyString(receipt.receiptId, "receiptId");
  const post = object(receipt.post);
  const identities = [
    post.shareUrn,
    post.activityUrn,
    post.publicUrl,
    post.analyticsUrl,
  ];
  if (!identities.some((identity) => typeof identity === "string")) {
    throw new Error("Receipt must contain a post identity");
  }
  const window = object(receipt.window);
  if (
    !["dashboard-selection", "lifetime", "xlsx-export"].includes(
      String(window.kind),
    )
  ) {
    throw new Error("Invalid receipt window");
  }
  const metrics = object(receipt.metrics);
  for (const [name, metric] of Object.entries(metrics)) {
    if (!metricNames.has(name as keyof MetricValues)) {
      throw new Error(`Unknown receipt metric: ${name}`);
    }
    if (typeof metric !== "number" || !Number.isFinite(metric)) {
      throw new Error(`Invalid receipt metric: ${name}`);
    }
  }
  const provider = object(receipt.provider);
  if (
    !["linkedin-dashboard", "linkedin-xlsx"].includes(String(provider.name)) ||
    provider.estimated !== true
  ) {
    throw new Error("Invalid receipt provider");
  }
  const observedAt = nonEmptyString(receipt.observedAt, "observedAt");
  if (!Number.isFinite(Date.parse(observedAt))) {
    throw new Error("Invalid receipt observedAt");
  }
  const provenance = object(receipt.provenance);
  nonEmptyString(provenance.source, "provenance.source");
  if (
    !Array.isArray(receipt.warnings) ||
    receipt.warnings.some((warning) => typeof warning !== "string")
  ) {
    throw new Error("Invalid receipt warnings");
  }

  return value as MetricReceipt;
}
