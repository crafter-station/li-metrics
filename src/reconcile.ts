import { extractUrn } from "./parse";
import type {
  MetricReceipt,
  MetricValues,
  PostIdentity,
  ReconciliationDifference,
  ReconciliationResult,
} from "./types";

function identityTokens(receipt: MetricReceipt): string[] {
  const shareUrn =
    receipt.post.shareUrn ?? extractUrn(receipt.post.publicUrl, "share");
  const activityUrn =
    receipt.post.activityUrn ??
    extractUrn(receipt.post.analyticsUrl, "activity");
  return [shareUrn, activityUrn].filter(
    (value): value is string => typeof value === "string",
  );
}

function identity(receipts: MetricReceipt[]): PostIdentity {
  const result: PostIdentity = {};
  for (const receipt of receipts) {
    result.shareUrn ??= receipt.post.shareUrn;
    result.activityUrn ??= receipt.post.activityUrn;
    result.publicUrl ??= receipt.post.publicUrl;
    result.analyticsUrl ??= receipt.post.analyticsUrl;
  }
  return result;
}

export function reconcileReceipts(
  receipts: MetricReceipt[],
): ReconciliationResult[] {
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
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parents[rightRoot] = leftRoot;
    }
  };
  const tokenOwners = new Map<string, number>();
  receipts.forEach((receipt, index) => {
    for (const token of identityTokens(receipt)) {
      const owner = tokenOwners.get(token);
      if (owner === undefined) {
        tokenOwners.set(token, index);
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
  for (const receipt of receipts) {
    if (identityTokens(receipt).length === 0) {
      throw new Error(
        `Receipt has no reconcilable identity: ${receipt.receiptId}`,
      );
    }
  }
  const results: ReconciliationResult[] = [];

  for (const grouped of groups.values()) {
    const sorted = [...grouped].sort((left, right) =>
      left.observedAt.localeCompare(right.observedAt),
    );
    const first = sorted[0];
    const last = sorted.at(-1);
    if (!first || !last) {
      continue;
    }
    const differences: ReconciliationDifference[] = [];

    const metricNames = new Set<keyof MetricValues>([
      ...(Object.keys(first.metrics) as Array<keyof MetricValues>),
      ...(Object.keys(last.metrics) as Array<keyof MetricValues>),
    ]);
    for (const metric of metricNames) {
      const from = first.metrics[metric];
      const to = last.metrics[metric];
      if (typeof from !== "number" || typeof to !== "number" || from === to) {
        continue;
      }
      differences.push({
        metric,
        from,
        to,
        delta: to - from,
        direction: to > from ? "up" : "down",
      });
    }

    results.push({
      identity: identity(sorted),
      receiptIds: sorted.map((receipt) => receipt.receiptId),
      differences,
      revisionDetected: differences.some(
        (difference) => difference.direction === "down",
      ),
    });
  }

  return results;
}
