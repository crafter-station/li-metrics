export const coreSkill = `# li-metrics core

Use li-metrics for read-only LinkedIn post analytics through the user's authenticated browser session.

## Agent contract

Always pass \`--json\` when consuming one result and \`--ndjson\` when streaming arrays. Default output is designed for humans and may change presentation without notice.

\`\`\`bash
li-metrics doctor --json
li-metrics posts week --json
li-metrics post metrics "<LinkedIn post URL or URN>" --json
\`\`\`

Never scrape the human output. Treat JSON schemas as the machine contract:

\`\`\`bash
li-metrics schema --json
li-metrics schema post.metrics --json
\`\`\`

The CLI is read-only on LinkedIn. It may write local append-only receipts only when the user asks for a checkpoint or import.

Run \`li-metrics skills get core --full\` for workflows, evidence rules, and the complete command map.`;

export const fullCoreSkill = `${coreSkill}

## Setup check

\`\`\`bash
li-metrics doctor --json
\`\`\`

Require \`ok: true\` before browser-backed commands. Dia must expose remote debugging, normally on port 9222, and an authenticated LinkedIn tab must be visible.

## Discovery

Find the user's posts visible in LinkedIn's seven-day analytics view:

\`\`\`bash
li-metrics posts week --json
\`\`\`

Use \`--no-details\` only when cards and links are enough. Detailed capture visits each post analytics page and produces receipts with lifetime snapshot metrics.

## Single-post metrics

\`\`\`bash
li-metrics post metrics "<public URL, analytics URL, share URN, or activity URN>" --json
\`\`\`

Prefer a public post URL when the user provides one. Preserve \`observedAt\`, \`window\`, \`provider\`, \`warnings\`, and \`provenance\` when citing results.

## Append-only checkpoints

\`\`\`bash
li-metrics checkpoint capture "<post>" --json
li-metrics checkpoint capture "<post>" --dry-run --json
li-metrics receipt list --json
\`\`\`

Checkpoint capture writes a local immutable receipt. Use \`--dry-run\` when the user did not authorize a filesystem write.

## LinkedIn XLSX exports

\`\`\`bash
li-metrics import xlsx ~/Downloads/SinglePostAnalytics_*.xlsx --json
li-metrics import xlsx export-a.xlsx export-b.xlsx --ndjson
\`\`\`

Imports are local-only and never contact LinkedIn. Each XLSX export becomes a receipt.

## Reconciliation

\`\`\`bash
li-metrics reconcile receipt-a.json receipt-b.json --json
\`\`\`

Reconciliation compares the earliest and latest receipt for each post. A downward metric change sets \`revisionDetected: true\`; report it as a platform revision, not negative audience behavior.

## Weekly decisions

\`\`\`bash
li-metrics brief week --json
\`\`\`

Keep these evidence boundaries:

- Weekly cards identify posts visible in the selected dashboard period.
- Per-post detail metrics are lifetime snapshots observed at capture time.
- Do not describe lifetime totals as seven-day attribution.
- LinkedIn may revise metrics after publication.
- Use repeated checkpoints before making causal claims.

## Machine interfaces

\`\`\`bash
li-metrics schema --json
li-metrics schema posts.week --json
li-metrics schema post.metrics --json
li-metrics schema checkpoint.capture --json
li-metrics schema import.xlsx --json
li-metrics schema reconcile --json
li-metrics schema brief.week --json
\`\`\`

Exit code 0 means success. Exit code 1 means the command or readiness check failed. With \`--json\` or \`--ndjson\`, errors are emitted to stderr as:

\`\`\`json
{"error":{"code":"LI_METRICS_ERROR","message":"..."}}
\`\`\`

Do not copy cookies, call undocumented LinkedIn endpoints directly, publish content, react, comment, or send messages.`;

export function skillNames(): string[] {
  return ["core"];
}

export function getSkill(name: string, full: boolean): string {
  if (name !== "core") {
    throw new Error(`Unknown skill: ${name}`);
  }
  return full ? fullCoreSkill : coreSkill;
}
