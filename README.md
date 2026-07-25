# li-metrics

Read-only LinkedIn post analytics CLI for an authenticated Dia session.

This is an unofficial project and is not affiliated with LinkedIn.

It uses `agent-browser` over CDP, keeps authentication inside the browser, and
stores append-only receipts. It does not publish, react, comment, copy cookies,
or call LinkedIn's internal RSC endpoints directly.

## Requirements

- Bun
- agent-browser `>=0.31.1 <0.34.0`
- `unzip`
- Dia running with remote debugging on port `9222`
- An authenticated LinkedIn session in Dia

## Setup

```bash
bun add -g @crafter/li-metrics
li-metrics doctor
```

For local development:

```bash
bun install
bun run src/cli.ts doctor
```

## Native build

ScriptC can compile the CLI into a host-native executable:

```bash
bun run native:coverage
bun run native:build
./dist/li-metrics --json schema post.metrics
./dist/li-metrics doctor
```

The current build compiles 100% of analyzed statements statically and does not
embed a JavaScript engine. Browser commands still require `agent-browser`, and
XLSX imports require the system `unzip` executable.

## Commands

```bash
bun run src/cli.ts posts week
bun run src/cli.ts posts week --no-details
bun run src/cli.ts post metrics "https://www.linkedin.com/feed/update/urn:li:share:..."
bun run src/cli.ts checkpoint capture "urn:li:share:..."
bun run src/cli.ts import xlsx ~/Downloads/SinglePostAnalytics_*.xlsx
bun run src/cli.ts receipt list
bun run src/cli.ts reconcile receipt-a.json receipt-b.json
bun run src/cli.ts brief week
bun run src/cli.ts schema
```

Use `--json` or `--ndjson` for agent pipelines. Set
`LI_METRICS_AGENT_BROWSER_BIN` only when `agent-browser` is not on `PATH`.

The browser provider currently supports LinkedIn's 7-day Content analytics
view. Per-post detail values are lifetime snapshots. Capture consistent
checkpoints before drawing causal conclusions because LinkedIn can revise
metrics after publication.

English and Spanish LinkedIn interfaces are supported. Other interface
languages fail explicitly instead of writing incomplete receipts.

XLSX imports are bounded to 25 MB compressed, 100 MB uncompressed, 1,000 ZIP
entries, and 10,000 worksheet rows.
