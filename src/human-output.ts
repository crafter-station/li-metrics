import type { ImportBatchResult } from "./import-workflow";
import type {
  BackfillResult,
  CohortReport,
  MetricReceipt,
  MetricValues,
  ReconciliationResult,
  TrendReport,
  WeeklyCapture,
} from "./types";

export type Colors = {
  bold: (value: string | number) => string;
  dim: (value: string | number) => string;
  red: (value: string | number) => string;
  green: (value: string | number) => string;
  yellow: (value: string | number) => string;
  cyan: (value: string | number) => string;
};

type DoctorResult = {
  ok: boolean;
  agentBrowser: {
    executable?: string;
    version?: string;
    supported: boolean;
    supportedRange: string;
  };
  cdp: {
    connected: boolean;
    browser?: string;
    port: number;
  };
  linkedinSessionVisible: boolean;
};

type WeeklyBrief = {
  facts: string[];
  unknowns: string[];
  actions: string[];
  evidence: WeeklyCapture;
};

const metricLabels: Record<keyof MetricValues, string> = {
  impressions: "Impressions",
  membersReached: "Members reached",
  profileViews: "Profile views",
  followersGained: "Followers gained",
  socialEngagements: "Social engagements",
  reactions: "Reactions",
  comments: "Comments",
  reposts: "Reposts",
  saves: "Saves",
  sends: "Sends",
  linkClicks: "Link clicks",
  linkEngagements: "Link engagements",
  premiumCtaEngagements: "Premium CTA engagements",
  inNetworkPercent: "In network",
  outOfNetworkPercent: "Out of network",
};

const metricOrder: Array<keyof MetricValues> = [
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

function number(value: number): string {
  return value.toLocaleString("en-US");
}

function decimal(value: number, digits: number): string {
  const factor = digits === 1 ? 10 : 100;
  const rounded = Math.round(value * factor);
  const sign = rounded < 0 ? "-" : "";
  const absolute = Math.abs(rounded);
  const whole = Math.floor(absolute / factor);
  const fraction = String(absolute % factor).padStart(digits, "0");
  return `${sign}${whole}.${fraction}`;
}

function line(value: string, colors: Colors): string {
  return `  ${colors.dim("│")} ${value}`;
}

function headline(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return fallback;
  }
  return normalized.length > 92 ? `${normalized.slice(0, 89)}...` : normalized;
}

function identity(receipt: MetricReceipt): string {
  return (
    receipt.post.publicUrl ??
    receipt.post.analyticsUrl ??
    receipt.post.shareUrn ??
    receipt.post.activityUrn ??
    receipt.receiptId
  );
}

function compactMetrics(metrics: MetricValues, colors: Colors): string {
  const values: string[] = [];
  if (metrics.impressions !== undefined) {
    values.push(`${colors.bold(number(metrics.impressions))} impressions`);
  }
  if (metrics.socialEngagements !== undefined) {
    values.push(
      `${colors.bold(number(metrics.socialEngagements))} engagements`,
    );
  }
  if (metrics.saves !== undefined) {
    values.push(`${colors.bold(number(metrics.saves))} saves`);
  }
  if (metrics.sends !== undefined) {
    values.push(`${colors.bold(number(metrics.sends))} sends`);
  }
  return values.join(colors.dim(" · "));
}

function percentageMetric(metric: keyof MetricValues): boolean {
  return metric === "inNetworkPercent" || metric === "outOfNetworkPercent";
}

export function formatDoctor(result: DoctorResult, colors: Colors): string {
  const icon = result.ok ? colors.green("✓") : colors.red("✗");
  const title = result.ok
    ? colors.bold("li-metrics is ready")
    : colors.bold("li-metrics needs attention");
  const browserStatus = result.agentBrowser.executable
    ? `${result.agentBrowser.version ?? "unknown"} at ${result.agentBrowser.executable}`
    : "not found";
  const cdpStatus = result.cdp.connected
    ? `${result.cdp.browser ?? "browser"} on port ${result.cdp.port}`
    : `not connected on port ${result.cdp.port}`;
  const linkedinStatus = result.linkedinSessionVisible
    ? "authenticated tab found"
    : "authenticated tab not found";

  return [
    `${icon} ${title}`,
    line(`agent-browser  ${browserStatus}`, colors),
    line(`Dia            ${cdpStatus}`, colors),
    line(`LinkedIn       ${linkedinStatus}`, colors),
    result.agentBrowser.supported
      ? ""
      : line(
          `Supported agent-browser range: ${result.agentBrowser.supportedRange}`,
          colors,
        ),
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatReceipt(receipt: MetricReceipt, colors: Colors): string {
  const title = headline(receipt.post.commentary, identity(receipt));
  const metricLines: string[] = [];
  for (const metric of metricOrder) {
    const value = receipt.metrics[metric];
    if (value === undefined) {
      continue;
    }
    const formatted = percentageMetric(metric)
      ? `${number(value)}%`
      : number(value);
    metricLines.push(
      line(
        `${metricLabels[metric].padEnd(24)} ${colors.bold(formatted)}`,
        colors,
      ),
    );
  }

  return [
    colors.bold(title),
    colors.dim(identity(receipt)),
    "",
    ...metricLines,
    "",
    `${colors.dim("Observed")} ${receipt.observedAt}  ${colors.dim("Source")} ${receipt.provider.name}`,
    ...receipt.warnings.map((warning) => colors.yellow(`! ${warning}`)),
  ]
    .filter((value, index, values) => {
      if (value !== "") {
        return true;
      }
      return values[index - 1] !== "";
    })
    .join("\n")
    .trim();
}

export function formatWeeklyCapture(
  capture: WeeklyCapture,
  colors: Colors,
): string {
  const totalImpressions = capture.receipts.reduce(
    (sum, receipt) => sum + (receipt.metrics.impressions ?? 0),
    0,
  );
  const totalEngagements = capture.receipts.reduce(
    (sum, receipt) => sum + (receipt.metrics.socialEngagements ?? 0),
    0,
  );
  const summary =
    capture.receipts.length > 0
      ? `${capture.posts.length} posts · ${number(totalImpressions)} impressions · ${number(totalEngagements)} engagements`
      : `${capture.posts.length} posts`;
  const rows =
    capture.receipts.length > 0
      ? capture.receipts.flatMap((receipt, index) => [
          "",
          `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(headline(receipt.post.commentary, identity(receipt)))}`,
          line(compactMetrics(receipt.metrics, colors), colors),
          line(identity(receipt), colors),
        ])
      : capture.posts.flatMap((post, index) => [
          "",
          `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(headline(post.commentary, post.cardText))}`,
          line(
            [post.cardImpressionsDisplay, post.cardEngagementsDisplay]
              .filter(Boolean)
              .join(" · "),
            colors,
          ),
          post.publicUrl ? line(post.publicUrl, colors) : "",
        ]);

  return [
    `${colors.bold("LinkedIn posts")} ${colors.dim(capture.period.label)}`,
    colors.cyan(summary),
    ...rows,
    "",
    `${colors.dim("Observed")} ${capture.observedAt}`,
    ...capture.warnings.map((warning) => colors.yellow(`! ${warning}`)),
  ]
    .filter((value, index, values) => {
      if (value !== "") {
        return true;
      }
      return values[index - 1] !== "";
    })
    .join("\n")
    .trim();
}

export function formatCheckpoint(
  result: ImportBatchResult,
  colors: Colors,
): string {
  return [
    formatReceipt(result.receipt, colors),
    "",
    result.path
      ? `${colors.green("✓")} Saved ${colors.dim(result.path)}`
      : `${colors.yellow("◇")} Dry run, receipt not written`,
  ].join("\n");
}

export function formatBackfill(
  results: BackfillResult[],
  colors: Colors,
): string {
  const succeeded = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  return [
    colors.bold(
      `Backfilled ${succeeded.length}/${results.length} LinkedIn post(s)`,
    ),
    ...results.flatMap((result) => {
      if (!result.ok) {
        return [
          "",
          `${colors.red("✗")} ${colors.bold(result.input)}`,
          line(result.error, colors),
        ];
      }
      return [
        "",
        `${colors.green("✓")} ${colors.bold(headline(result.receipt.post.commentary, identity(result.receipt)))}`,
        line(compactMetrics(result.receipt.metrics, colors), colors),
        line(result.path ?? "Dry run, receipt not written", colors),
      ];
    }),
    failed.length > 0
      ? `\n${colors.yellow(`${failed.length} post(s) failed`)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatImports(
  results: ImportBatchResult[],
  colors: Colors,
): string {
  if (results.length === 0) {
    return colors.dim("No XLSX files imported.");
  }
  return [
    colors.bold(`Imported ${results.length} LinkedIn XLSX export(s)`),
    ...results.flatMap((result, index) => [
      "",
      `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(headline(result.receipt.post.commentary, identity(result.receipt)))}`,
      line(compactMetrics(result.receipt.metrics, colors), colors),
      line(result.path ?? "Dry run, receipt not written", colors),
    ]),
  ].join("\n");
}

export function formatReconciliations(
  results: ReconciliationResult[],
  colors: Colors,
): string {
  if (results.length === 0) {
    return colors.dim("No receipts to reconcile.");
  }
  return [
    colors.bold(`Reconciled ${results.length} post(s)`),
    ...results.flatMap((result, index) => {
      const id =
        result.identity.publicUrl ??
        result.identity.shareUrn ??
        result.identity.activityUrn ??
        "unknown post";
      const differences =
        result.differences.length > 0
          ? result.differences.map((difference) => {
              const delta =
                difference.delta > 0
                  ? colors.green(`+${number(difference.delta)}`)
                  : colors.red(number(difference.delta));
              return line(
                `${metricLabels[difference.metric]} ${number(difference.from)} → ${number(difference.to)} (${delta})`,
                colors,
              );
            })
          : [line("No metric differences", colors)];
      return [
        "",
        `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(id)}`,
        ...differences,
        result.revisionDetected
          ? line(colors.yellow("LinkedIn revision detected"), colors)
          : "",
      ];
    }),
  ]
    .filter(Boolean)
    .join("\n");
}

function section(
  title: string,
  items: string[],
  colors: Colors,
  marker: string,
): string[] {
  return [
    colors.bold(title),
    ...items.map((item) => `${colors.dim(marker)} ${item}`),
  ];
}

export function formatBrief(brief: WeeklyBrief, colors: Colors): string {
  return [
    colors.bold("LinkedIn weekly brief"),
    colors.dim(`Evidence captured ${brief.evidence.observedAt}`),
    "",
    ...section("Facts", brief.facts, colors, "•"),
    "",
    ...section("Unknowns", brief.unknowns, colors, "?"),
    "",
    ...section("Next actions", brief.actions, colors, "→"),
  ].join("\n");
}

export function formatReceiptList(
  results: Array<{ path: string; receipt: MetricReceipt }>,
  colors: Colors,
): string {
  if (results.length === 0) {
    return colors.dim("No stored metric receipts.");
  }
  return [
    colors.bold(`${results.length} stored metric receipt(s)`),
    ...results.flatMap(({ path, receipt }, index) => [
      "",
      `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(headline(receipt.post.commentary, identity(receipt)))}`,
      line(compactMetrics(receipt.metrics, colors), colors),
      line(`${receipt.observedAt} · ${path}`, colors),
    ]),
  ].join("\n");
}

function trendIdentity(result: TrendReport["trends"][number]): string {
  return (
    result.identity.publicUrl ??
    result.identity.analyticsUrl ??
    result.identity.shareUrn ??
    result.identity.activityUrn ??
    "unknown post"
  );
}

export function formatTrend(report: TrendReport, colors: Colors): string {
  const rows = report.trends.flatMap((trend, index) => {
    const changes =
      trend.differences.length > 0
        ? trend.differences.map((difference) => {
            const delta =
              difference.delta > 0
                ? colors.green(`+${number(difference.delta)}`)
                : colors.red(number(difference.delta));
            return line(
              `${metricLabels[difference.metric]} ${number(difference.from)} → ${number(difference.to)} (${delta})`,
              colors,
            );
          })
        : [line("No metric changes", colors)];
    return [
      "",
      `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(trendIdentity(trend))}`,
      line(
        `${trend.receiptCount} checkpoints · ${decimal(trend.elapsedDays, 1)} days`,
        colors,
      ),
      ...changes,
      trend.revisionDetected
        ? line(colors.yellow("LinkedIn revision detected"), colors)
        : "",
    ];
  });

  return [
    colors.bold("LinkedIn checkpoint trends"),
    colors.cyan(
      `${report.comparablePostCount}/${report.postCount} posts have comparable checkpoints`,
    ),
    ...rows,
    report.insufficientHistoryCount > 0
      ? `\n${colors.dim(`${report.insufficientHistoryCount} post(s) need another checkpoint`)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function rate(value: number | undefined): string {
  return value === undefined ? "n/a" : `${decimal(value, 2)}%`;
}

export function formatCohort(report: CohortReport, colors: Colors): string {
  const totals = compactMetrics(report.totals, colors);
  return [
    `${colors.bold("LinkedIn cohort")} ${colors.dim(`since ${report.since}`)}`,
    colors.cyan(
      `${report.postCount} posts${totals.length > 0 ? ` · ${totals}` : ""}`,
    ),
    ...report.posts.flatMap((post, index) => {
      const id =
        post.identity.publicUrl ??
        post.identity.analyticsUrl ??
        post.identity.shareUrn ??
        post.identity.activityUrn ??
        post.receiptId;
      return [
        "",
        `${colors.cyan(String(index + 1).padStart(2, "0"))} ${colors.bold(id)}`,
        line(compactMetrics(post.metrics, colors), colors),
        line(
          `engagement ${rate(post.rates.engagement)} · profile ${rate(post.rates.profileView)} · followers ${rate(post.rates.followerConversion)} · saves ${rate(post.rates.save)}`,
          colors,
        ),
        line(`Published ${post.publishedAt}`, colors),
      ];
    }),
  ].join("\n");
}

export function formatSchema(
  operation: string | undefined,
  available: string[],
  colors: Colors,
): string {
  const target = operation ?? "all operations";
  return [
    `${colors.bold("Schema")} ${target}`,
    "JSON Schema is intended for machines.",
    "",
    colors.cyan(`li-metrics schema${operation ? ` ${operation}` : ""} --json`),
    "",
    `${colors.dim("Available")} ${available.join(", ")}`,
  ].join("\n");
}

export function formatError(message: string, colors: Colors): string {
  return `${colors.red("✗")} ${colors.bold(message)}`;
}
