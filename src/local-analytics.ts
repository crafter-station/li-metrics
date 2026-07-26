import { extractUrn } from "./parse";
import type {
  CohortPost,
  CohortReport,
  MetricReceipt,
  MetricValues,
  PostIdentity,
  ReconciliationDifference,
  TrendReport,
} from "./types";

const metricNames: Array<keyof MetricValues> = [
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
];

function identityTokens(receipt: MetricReceipt): string[] {
  const shareUrn =
    receipt.post.shareUrn ?? extractUrn(receipt.post.publicUrl, "share");
  const activityUrn =
    receipt.post.activityUrn ??
    extractUrn(receipt.post.analyticsUrl, "activity");
  const tokens: string[] = [];
  if (shareUrn !== undefined) {
    tokens.push(shareUrn);
  }
  if (activityUrn !== undefined) {
    tokens.push(activityUrn);
  }
  return tokens;
}

function identity(receipts: MetricReceipt[]): PostIdentity {
  const result: PostIdentity = {};
  for (const receipt of receipts) {
    if (result.shareUrn === undefined) {
      result.shareUrn = receipt.post.shareUrn;
    }
    if (result.activityUrn === undefined) {
      result.activityUrn = receipt.post.activityUrn;
    }
    if (result.publicUrl === undefined) {
      result.publicUrl = receipt.post.publicUrl;
    }
    if (result.analyticsUrl === undefined) {
      result.analyticsUrl = receipt.post.analyticsUrl;
    }
  }
  return result;
}

export function groupReceipts(receipts: MetricReceipt[]): MetricReceipt[][] {
  const parents = receipts.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parents[root] !== root) {
      root = parents[root] ?? root;
    }
    while (parents[index] !== index) {
      const next = parents[index] ?? root;
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  };
  const owners = new Map<string, number>();

  receipts.forEach((receipt, index) => {
    const tokens = identityTokens(receipt);
    if (tokens.length === 0) {
      throw new Error(
        `Receipt has no comparable identity: ${receipt.receiptId}`,
      );
    }
    for (const token of tokens) {
      const owner = owners.get(token);
      if (owner === undefined) {
        owners.set(token, index);
      } else {
        union(index, owner);
      }
    }
  });

  const groups = new Map<number, MetricReceipt[]>();
  receipts.forEach((receipt, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), receipt]);
  });
  return [...groups.values()].map((group) =>
    [...group].sort((left, right) =>
      left.observedAt.localeCompare(right.observedAt),
    ),
  );
}

function differences(
  first: MetricReceipt,
  latest: MetricReceipt,
): ReconciliationDifference[] {
  const result: ReconciliationDifference[] = [];
  for (const metric of metricNames) {
    const from = first.metrics[metric];
    const to = latest.metrics[metric];
    if (typeof from !== "number" || typeof to !== "number" || from === to) {
      continue;
    }
    result.push({
      metric,
      from,
      to,
      delta: to - from,
      direction: to > from ? "up" : "down",
    });
  }
  return result;
}

function isoMilliseconds(value: string): number {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/,
  );
  if (!match) {
    throw new Error(`Invalid ISO timestamp: ${value}`);
  }
  const year = parseInt(match[1] ?? "", 10);
  const month = parseInt(match[2] ?? "", 10);
  const day = parseInt(match[3] ?? "", 10);
  const hour = parseInt(match[4] ?? "", 10);
  const minute = parseInt(match[5] ?? "", 10);
  const second = parseInt(match[6] ?? "", 10);
  const millisecond = parseInt(match[7] ?? "0", 10);
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const adjustedMonth = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * adjustedMonth + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear;
  const days = era * 146097 + dayOfEra - 719468;
  return (
    days * 86_400_000 +
    hour * 3_600_000 +
    minute * 60_000 +
    second * 1000 +
    millisecond
  );
}

export function buildTrendReport(
  receipts: MetricReceipt[],
  generatedAt = new Date().toISOString(),
): TrendReport {
  const groups = groupReceipts(receipts);
  const trends = groups
    .filter((group) => group.length >= 2)
    .map((group) => {
      const first = group[0];
      const latest = group.at(-1);
      if (!first || !latest) {
        throw new Error("Could not resolve trend endpoints");
      }
      const changes = differences(first, latest);
      return {
        identity: identity(group),
        receiptCount: group.length,
        firstObservedAt: first.observedAt,
        latestObservedAt: latest.observedAt,
        elapsedDays:
          (isoMilliseconds(latest.observedAt) -
            isoMilliseconds(first.observedAt)) /
          86_400_000,
        differences: changes,
        revisionDetected: changes.some(
          (difference) => difference.direction === "down",
        ),
      };
    })
    .sort((left, right) =>
      right.latestObservedAt.localeCompare(left.latestObservedAt),
    );

  return {
    generatedAt,
    postCount: groups.length,
    comparablePostCount: trends.length,
    insufficientHistoryCount: groups.length - trends.length,
    trends,
  };
}

function urnTimestamp(receipt: MetricReceipt): string | undefined {
  const activityUrn =
    receipt.post.activityUrn ??
    extractUrn(receipt.post.analyticsUrl, "activity");
  const shareUrn =
    receipt.post.shareUrn ?? extractUrn(receipt.post.publicUrl, "share");
  const urn = activityUrn ?? shareUrn;
  const id = urn?.match(/(\d+)$/)?.[1];
  if (!id) {
    return undefined;
  }
  const milliseconds = Math.floor(Number(id) / 4_194_304);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) {
    return undefined;
  }
  const days = Math.floor(milliseconds / 86_400_000);
  let remainder = milliseconds - days * 86_400_000;
  const hour = Math.floor(remainder / 3_600_000);
  remainder -= hour * 3_600_000;
  const minute = Math.floor(remainder / 60_000);
  remainder -= minute * 60_000;
  const second = Math.floor(remainder / 1000);
  const millisecond = remainder - second * 1000;
  const shiftedDays = days + 719468;
  const era = Math.floor(shiftedDays / 146097);
  const dayOfEra = shiftedDays - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  let year = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthPrime = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthPrime + 2) / 5) + 1;
  const month = monthPrime + (monthPrime < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.${String(millisecond).padStart(3, "0")}Z`;
}

export function publishedAt(receipt: MetricReceipt): string | undefined {
  if (receipt.post.publishedDate) {
    const normalized = normalizeDate(receipt.post.publishedDate);
    if (normalized !== undefined) {
      return `${normalized}T00:00:00.000Z`;
    }
  }
  return urnTimestamp(receipt);
}

function ratio(
  numerator: number | undefined,
  denominator: number | undefined,
): number | undefined {
  if (
    numerator === undefined ||
    denominator === undefined ||
    denominator === 0
  ) {
    return undefined;
  }
  return (numerator / denominator) * 100;
}

function cohortPost(receipt: MetricReceipt, publication: string): CohortPost {
  return {
    identity: identity([receipt]),
    publishedAt: publication,
    observedAt: receipt.observedAt,
    receiptId: receipt.receiptId,
    metrics: receipt.metrics,
    rates: {
      engagement: ratio(
        receipt.metrics.socialEngagements,
        receipt.metrics.impressions,
      ),
      profileView: ratio(
        receipt.metrics.profileViews,
        receipt.metrics.impressions,
      ),
      followerConversion: ratio(
        receipt.metrics.followersGained,
        receipt.metrics.impressions,
      ),
      save: ratio(receipt.metrics.saves, receipt.metrics.impressions),
    },
  };
}

function aggregate(posts: CohortPost[]): {
  totals: MetricValues;
  averages: MetricValues;
} {
  const totals: MetricValues = {};
  const counts: Partial<Record<keyof MetricValues, number>> = {};
  for (const post of posts) {
    for (const metric of metricNames) {
      const value = post.metrics[metric];
      if (value === undefined || metric.endsWith("Percent")) {
        continue;
      }
      totals[metric] = (totals[metric] ?? 0) + value;
      counts[metric] = (counts[metric] ?? 0) + 1;
    }
  }
  const averages: MetricValues = {};
  for (const metric of metricNames) {
    const count = counts[metric];
    const total = totals[metric];
    if (count !== undefined && total !== undefined) {
      averages[metric] = total / count;
    }
  }
  return { totals, averages };
}

function leapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function validDate(year: number, month: number, day: number): boolean {
  const days = [
    31,
    leapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return month >= 1 && month <= 12 && day >= 1 && day <= (days[month - 1] ?? 0);
}

function normalizeDate(value: string): string | undefined {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const us = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const year = parseInt(iso?.[1] ?? us?.[3] ?? "", 10);
  const month = parseInt(iso?.[2] ?? us?.[1] ?? "", 10);
  const day = parseInt(iso?.[3] ?? us?.[2] ?? "", 10);
  if (!validDate(year, month, day)) {
    return undefined;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseSince(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("--since must use YYYY-MM-DD");
  }
  const normalized = normalizeDate(value);
  if (normalized === undefined) {
    throw new Error(`Invalid --since date: ${value}`);
  }
  return `${normalized}T00:00:00.000Z`;
}

export function buildCohortReport(
  receipts: MetricReceipt[],
  since: string,
  generatedAt = new Date().toISOString(),
): CohortReport {
  const sinceIso = parseSince(since);
  const posts: CohortPost[] = [];
  for (const group of groupReceipts(receipts)) {
    const receipt = group.at(-1);
    if (receipt === undefined) {
      continue;
    }
    const publication = publishedAt(receipt);
    if (publication !== undefined && publication >= sinceIso) {
      posts.push(cohortPost(receipt, publication));
    }
  }
  posts.sort(
    (left, right) =>
      (right.metrics.impressions ?? 0) - (left.metrics.impressions ?? 0),
  );
  const { totals, averages } = aggregate(posts);

  return {
    generatedAt,
    since,
    postCount: posts.length,
    totals,
    averages,
    posts,
  };
}
