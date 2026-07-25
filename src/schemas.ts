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
} as const;

function operation(input: object, output: object) {
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
