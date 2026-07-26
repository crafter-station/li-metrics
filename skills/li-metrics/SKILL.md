---
name: li-metrics
description: Read-only LinkedIn post analytics through an authenticated browser. Use when agents need weekly post discovery, post metrics, batch backfills, checkpoints, local trends, cohorts, XLSX imports, reconciliation, or evidence-backed weekly decisions.
allowed-tools: Bash(li-metrics:*)
---

# li-metrics

Install the CLI:

```bash
bun add -g @crafter/li-metrics
```

## Start here

Before using li-metrics, load its version-matched agent instructions:

```bash
li-metrics skills get core
```

For the complete command map and evidence rules:

```bash
li-metrics skills get core --full
```

The CLI serves these instructions so the skill stays aligned with the installed version.

Default output is for humans. Agents must use `--json` for one result or `--ndjson` for streams. Never parse the human presentation.
