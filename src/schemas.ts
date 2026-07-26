const definitions = {
  PostIdentity: {
    type: "object",
    properties: {
      shareUrn: { type: "string" },
      activityUrn: { type: "string" },
      publicUrl: { type: "string", format: "uri" },
      analyticsUrl: { type: "string", format: "uri" },
    },
    anyOf: [
      { required: ["shareUrn"] },
      { required: ["activityUrn"] },
      { required: ["publicUrl"] },
      { required: ["analyticsUrl"] },
    ],
  },
  MetricValues: {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      [
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
      ].map((name) => [name, { type: "number" }]),
    ),
  },
  MetricReceipt: {
    type: "object",
    required: [
      "receiptVersion",
      "receiptId",
      "post",
      "window",
      "metrics",
      "provider",
      "observedAt",
      "provenance",
      "warnings",
    ],
    properties: {
      receiptVersion: { const: 1 },
      receiptId: { type: "string" },
      post: { $ref: "#/$defs/PostIdentity" },
      window: {
        type: "object",
        required: ["kind"],
        properties: {
          kind: {
            enum: ["dashboard-selection", "lifetime", "xlsx-export"],
          },
          label: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          endExclusive: { type: "boolean" },
        },
      },
      metrics: { $ref: "#/$defs/MetricValues" },
      provider: {
        type: "object",
        required: ["name", "estimated"],
        properties: {
          name: { enum: ["linkedin-dashboard", "linkedin-xlsx"] },
          estimated: { const: true },
          revisionDetected: { type: "boolean" },
        },
      },
      observedAt: { type: "string", format: "date-time" },
      provenance: {
        type: "object",
        required: ["source"],
        properties: {
          source: { type: "string" },
          sourceSha256: { type: "string" },
          sourceFilenameId: { type: "string" },
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
  WeeklyCapture: {
    type: "object",
    required: ["period", "posts", "receipts", "observedAt", "warnings"],
    properties: {
      period: {
        type: "object",
        required: ["days", "label"],
        properties: {
          days: { const: 7 },
          label: { type: "string" },
        },
      },
      posts: {
        type: "array",
        items: { $ref: "#/$defs/PostIdentity" },
      },
      receipts: {
        type: "array",
        items: { $ref: "#/$defs/MetricReceipt" },
      },
      observedAt: { type: "string", format: "date-time" },
      warnings: { type: "array", items: { type: "string" } },
    },
  },
  ReconciliationResult: {
    type: "object",
    required: ["identity", "receiptIds", "differences", "revisionDetected"],
    properties: {
      identity: { $ref: "#/$defs/PostIdentity" },
      receiptIds: { type: "array", items: { type: "string" } },
      differences: {
        type: "array",
        items: {
          type: "object",
          required: ["metric", "from", "to", "delta", "direction"],
          properties: {
            metric: { type: "string" },
            from: { type: "number" },
            to: { type: "number" },
            delta: { type: "number" },
            direction: { enum: ["up", "down"] },
          },
        },
      },
      revisionDetected: { type: "boolean" },
    },
  },
  BackfillResult: {
    oneOf: [
      {
        type: "object",
        required: ["input", "ok", "receipt", "path"],
        properties: {
          input: { type: "string" },
          ok: { const: true },
          receipt: { $ref: "#/$defs/MetricReceipt" },
          path: { type: ["string", "null"] },
        },
      },
      {
        type: "object",
        required: ["input", "ok", "error"],
        properties: {
          input: { type: "string" },
          ok: { const: false },
          error: { type: "string" },
        },
      },
    ],
  },
  TrendResult: {
    type: "object",
    required: [
      "identity",
      "receiptCount",
      "firstObservedAt",
      "latestObservedAt",
      "elapsedDays",
      "differences",
      "revisionDetected",
    ],
    properties: {
      identity: { $ref: "#/$defs/PostIdentity" },
      receiptCount: { type: "integer" },
      firstObservedAt: { type: "string", format: "date-time" },
      latestObservedAt: { type: "string", format: "date-time" },
      elapsedDays: { type: "number" },
      differences: {
        type: "array",
        items: {
          type: "object",
          required: ["metric", "from", "to", "delta", "direction"],
          properties: {
            metric: { type: "string" },
            from: { type: "number" },
            to: { type: "number" },
            delta: { type: "number" },
            direction: { enum: ["up", "down"] },
          },
        },
      },
      revisionDetected: { type: "boolean" },
    },
  },
  TrendReport: {
    type: "object",
    required: [
      "generatedAt",
      "postCount",
      "comparablePostCount",
      "insufficientHistoryCount",
      "trends",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      postCount: { type: "integer" },
      comparablePostCount: { type: "integer" },
      insufficientHistoryCount: { type: "integer" },
      trends: {
        type: "array",
        items: { $ref: "#/$defs/TrendResult" },
      },
    },
  },
  CohortPost: {
    type: "object",
    required: [
      "identity",
      "publishedAt",
      "observedAt",
      "receiptId",
      "metrics",
      "rates",
    ],
    properties: {
      identity: { $ref: "#/$defs/PostIdentity" },
      publishedAt: { type: "string", format: "date-time" },
      observedAt: { type: "string", format: "date-time" },
      receiptId: { type: "string" },
      metrics: { $ref: "#/$defs/MetricValues" },
      rates: {
        type: "object",
        properties: {
          engagement: { type: "number" },
          profileView: { type: "number" },
          followerConversion: { type: "number" },
          save: { type: "number" },
        },
      },
    },
  },
  CohortReport: {
    type: "object",
    required: [
      "generatedAt",
      "since",
      "postCount",
      "totals",
      "averages",
      "posts",
    ],
    properties: {
      generatedAt: { type: "string", format: "date-time" },
      since: { type: "string", format: "date" },
      postCount: { type: "integer" },
      totals: { $ref: "#/$defs/MetricValues" },
      averages: { $ref: "#/$defs/MetricValues" },
      posts: {
        type: "array",
        items: { $ref: "#/$defs/CohortPost" },
      },
    },
  },
} as const;

function operation<TInput extends object, TOutput extends object>(
  input: TInput,
  output: TOutput,
) {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $defs: definitions,
    input,
    output,
  };
}

export const operationSchemas = {
  "posts.week": operation(
    {
      type: "object",
      properties: {
        days: { const: 7 },
        details: { type: "boolean" },
      },
    },
    { $ref: "#/$defs/WeeklyCapture" },
  ),
  "post.metrics": operation(
    {
      type: "object",
      required: ["post"],
      properties: { post: { type: "string" } },
    },
    { $ref: "#/$defs/MetricReceipt" },
  ),
  "checkpoint.capture": operation(
    {
      type: "object",
      required: ["post"],
      properties: {
        post: { type: "string" },
        dryRun: { type: "boolean" },
      },
    },
    {
      type: "object",
      required: ["receipt", "path"],
      properties: {
        receipt: { $ref: "#/$defs/MetricReceipt" },
        path: { type: ["string", "null"] },
      },
    },
  ),
  backfill: operation(
    {
      type: "object",
      required: ["posts"],
      properties: {
        posts: { type: "array", items: { type: "string" }, minItems: 1 },
        dryRun: { type: "boolean" },
      },
    },
    {
      type: "array",
      items: { $ref: "#/$defs/BackfillResult" },
    },
  ),
  trend: operation(
    { type: "object", properties: {} },
    { $ref: "#/$defs/TrendReport" },
  ),
  cohort: operation(
    {
      type: "object",
      required: ["since"],
      properties: {
        since: { type: "string", format: "date" },
      },
    },
    { $ref: "#/$defs/CohortReport" },
  ),
  "import.xlsx": operation(
    {
      type: "object",
      required: ["files"],
      properties: {
        files: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    {
      type: "array",
      items: {
        type: "object",
        required: ["receipt", "path"],
        properties: {
          receipt: { $ref: "#/$defs/MetricReceipt" },
          path: { type: ["string", "null"] },
        },
      },
    },
  ),
  reconcile: operation(
    {
      type: "object",
      required: ["files"],
      properties: {
        files: { type: "array", items: { type: "string" }, minItems: 1 },
      },
    },
    {
      type: "array",
      items: { $ref: "#/$defs/ReconciliationResult" },
    },
  ),
  "brief.week": operation(
    { type: "object", properties: {} },
    {
      type: "object",
      required: ["facts", "unknowns", "actions", "evidence"],
      properties: {
        facts: { type: "array", items: { type: "string" } },
        unknowns: { type: "array", items: { type: "string" } },
        actions: { type: "array", items: { type: "string" }, maxItems: 3 },
        evidence: { $ref: "#/$defs/WeeklyCapture" },
      },
    },
  ),
} as const;
