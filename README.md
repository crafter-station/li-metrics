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
li-metrics posts week
li-metrics posts week --no-details
li-metrics post metrics "https://www.linkedin.com/feed/update/urn:li:share:..."
li-metrics checkpoint capture "urn:li:share:..."
li-metrics import xlsx ~/Downloads/SinglePostAnalytics_*.xlsx
li-metrics receipt list
li-metrics reconcile receipt-a.json receipt-b.json
li-metrics brief week
li-metrics schema
```

The default is concise, colored output for humans. Use `--json` for one
machine-readable result or `--ndjson` for streams. Agents must always select
one of those structured modes and must not parse the human presentation.

Set
`LI_METRICS_AGENT_BROWSER_BIN` only when `agent-browser` is not on `PATH`.

## Agent skill

Install the repository skill, then load the version-matched instructions from
the CLI:

```bash
bunx skills add crafter-station/li-metrics -g
li-metrics skills get core
li-metrics skills get core --full
```

The installable discovery stub lives at `skills/li-metrics/SKILL.md`. The
operational guide is served by the installed CLI so command guidance stays
aligned with that release.

The browser provider currently supports LinkedIn's 7-day Content analytics
view. Per-post detail values are lifetime snapshots. Capture consistent
checkpoints before drawing causal conclusions because LinkedIn can revise
metrics after publication.

English and Spanish LinkedIn interfaces are supported. Other interface
languages fail explicitly instead of writing incomplete receipts.

XLSX imports are bounded to 25 MB compressed, 100 MB uncompressed, 1,000 ZIP
entries, and 10,000 worksheet rows.

## Releases

Releases use npm Trusted Publishing from `.github/workflows/release.yml`.
Configure the npm publisher with:

- Organization or user: `crafter-station`
- Repository: `li-metrics`
- Workflow filename: `release.yml`
- Environment: none
- Allowed action: `npm publish`

Run the `Release` workflow and select `patch`, `minor`, or `major`. The first
run commits the version bump to `main`; the resulting push verifies, publishes,
tags, and creates the GitHub release through OIDC.
