# Agent-browser papercuts from the li-metrics session

Date: 2026-07-25

Environment:

- agent-browser 0.31.1
- macOS arm64
- Dia over CDP on port 9222
- Chrome 150
- `li-metrics` namespace
- 23 browser tabs during the final probe

This is a retrospective dogfood report from building and validating
`li-metrics`. It separates confirmed observations from inferred risks. No
focus-changing repro was recorded because reproducing the primary issue would
interrupt the user's active Dia session again.

## Executive summary

The biggest problem is that automation attached to a user's existing browser
does not behave like a background worker. It takes over the visible tab,
leaves LinkedIn focused after finishing, and makes it difficult for the user to
keep working in X or another tab.

The final read-only probe showed LinkedIn as the active tab:

```text
→ [t23] Content analytics | LinkedIn
```

The user had been working in an X tab before the automation. This is not only
visual noise. Shared CDP state can also make later commands target the wrong
page.

## Ranked candidates

| ID | Priority | Owner | Confidence | Summary |
| --- | --- | --- | --- | --- |
| AB-001 | P1 | agent-browser | Confirmed | Add background mode and preserve user focus |
| AB-002 | P1 | agent-browser | Confirmed upstream | Pin sessions to CDP target IDs |
| AB-003 | P1 | agent-browser | Confirmed | Retry transient execution-context loss |
| LM-001 | P1 | li-metrics | Confirmed | Restore the exact original user tab |
| LM-002 | P2 | li-metrics | Confirmed | Reuse one dedicated automation tab |
| AB-004 | P2 | agent-browser | Confirmed | Return structured retryable errors |
| AB-005 | P2 | agent-browser | Design gap | Add an atomic scoped-tab workflow |
| LM-003 | P2 | li-metrics | Confirmed | Retry only safe browser operations |
| LM-004 | P2 | li-metrics | Confirmed | Make doctor test execution readiness |
| LM-005 | P3 | li-metrics | Confirmed | Sanitize browser command failures |

## Issue candidates

### AB-001: Background mode must not steal focus from an attached browser

Priority: P1

Status: Existing upstream issue

Links:

- [agent-browser #1247](https://github.com/vercel-labs/agent-browser/issues/1247)
- Related: [agent-browser #1530](https://github.com/vercel-labs/agent-browser/issues/1530)

Observed:

- The user was working in X.
- `li-metrics` opened and navigated LinkedIn analytics through CDP.
- Dia visibly switched to LinkedIn.
- After the automation completed, LinkedIn remained the active tab.
- `tab new --help` exposes no `--background`, `--no-activate`, or
  `--preserve-focus` option.

Impact:

- The user cannot keep working in the same browser while an agent runs.
- Multi-post capture repeatedly interrupts typing and reading.
- An automation that is logically read-only still has a disruptive UI side
  effect.

Proposed behavior:

- Add global `--background` and `AGENT_BROWSER_BACKGROUND`.
- Let `tab new` create a non-activated target.
- Let navigation and tab selection target a page without
  `Page.bringToFront`.
- Keep the user's foreground tab unchanged for the entire command.

Acceptance criteria:

- Start on an X tab.
- Run a background automation that opens, navigates, reads, and closes a
  LinkedIn tab.
- X remains foreground for the full run.
- The automation still targets the LinkedIn page correctly.

### AB-002: CDP sessions must pin to a target ID instead of following the active tab

Priority: P1

Status: Existing upstream issue

Link:

- [agent-browser #1530](https://github.com/vercel-labs/agent-browser/issues/1530)

Observed:

- The namespace was attached to a browser with 23 tabs.
- The CLI tracks one current tab with a global arrow.
- Session and namespace isolation do not imply visible-tab or target
  isolation.

Impact:

- A daemon restart or removed tab can silently retarget later commands.
- A command can read, navigate, or close the wrong user tab.
- Focus hijacking becomes a correctness and safety problem.

Proposed behavior:

- Persist the session-to-target binding by CDP target ID.
- Never fall back silently to index zero or a neighboring tab.
- Return a structured `tab_gone` error when the bound target disappears.
- Expose target IDs and ownership in `tab list --json`.

Acceptance criteria:

- Two namespaces attach to the same browser.
- Each namespace binds to a different target.
- Closing or activating unrelated tabs never changes either binding.
- A removed bound target produces `tab_gone`, not implicit retargeting.

### AB-003: `wait --fn` should recover from transient default execution-context loss

Priority: P1

Status: New issue candidate or regression

Observed error:

```text
CDP error (Runtime.evaluate): Cannot find default execution context
```

Reproduction from the session:

1. Navigate a newly created tab to LinkedIn Content analytics.
2. Immediately run `wait --fn` against the page.
3. The first attempt fails because the navigation replaced the execution
   context.
4. Running the same command again succeeds.

Impact:

- Valid workflows fail nondeterministically.
- Every caller has to recognize raw CDP error strings and implement retries.
- The error is especially common around SPA navigation and redirects.

Proposed behavior:

- Treat `Cannot find default execution context` and
  `Execution context was destroyed` as transient inside wait commands.
- Reacquire the main-frame execution context until the original timeout.
- Do not retry side-effecting commands automatically.

Acceptance criteria:

- A test repeatedly navigates while `wait --fn` is starting.
- The wait survives execution-context replacement.
- It still respects the caller's timeout.

### LM-001: Preserve and restore the user's exact original tab

Priority: P1

Status: Confirmed downstream mitigation

Observed:

- The automation left LinkedIn active instead of returning the user to X.

Proposed behavior:

- Capture the initial foreground tab ID before any browser mutation.
- Use a dedicated automation tab.
- In `finally`, close only the owned tab and restore the exact initial tab.
- If the original tab no longer exists, leave the user's current tab alone.

Acceptance criteria:

- Success, timeout, parsing failure, and SIGINT all restore the initial tab.
- The workflow never closes or navigates a tab it did not create.

This should be implemented even before upstream background mode lands. Once
background mode exists, restoration remains a fallback rather than the normal
path.

### LM-002: Reuse one owned tab for an entire batch

Priority: P2

Status: Confirmed workflow papercut

Observed:

- Weekly detail capture opens and closes a page for each post.
- Each target transition can bring LinkedIn to the foreground.

Impact:

- Three posts can cause several visible focus changes.
- Repeated CDP target creation increases execution-context races.
- Cleanup becomes harder to reason about.

Proposed behavior:

- Create one labeled tab such as `li-metrics-worker`.
- Reuse it for dashboard and post-detail navigation.
- Close it once at the end.
- Prefer background creation when upstream support is available.

Acceptance criteria:

- A weekly capture creates at most one new target.
- The target is always owned and labeled.
- The same target is reused for every post.

### AB-004: Errors need stable codes and a retryability signal

Priority: P2

Status: New issue candidate

Observed:

- The transient context failure surfaced as a raw protocol string.
- The caller had to infer that retrying was safe.

Proposed JSON shape:

```json
{
  "error": {
    "code": "execution_context_lost",
    "message": "The page navigated while evaluating the wait condition",
    "retriable": true,
    "operation": "wait.fn"
  }
}
```

Acceptance criteria:

- Known CDP failures map to documented stable codes.
- `retriable` is present for transient failures.
- Raw protocol details remain available behind a debug flag.

### AB-005: Add an atomic scoped-tab workflow

Priority: P2

Status: Design gap

Related:

- [agent-browser #1219](https://github.com/vercel-labs/agent-browser/issues/1219)
- [agent-browser #384](https://github.com/vercel-labs/agent-browser/issues/384)

Problem:

- Opening, switching, acting, closing, and restoring tabs requires several
  independent commands.
- Any failure between them can leave browser state changed.

Proposed capability:

```text
agent-browser tab scope --background --label li-metrics-worker -- <command>
```

The scope would:

- Remember the original foreground target.
- Create or bind one owned target.
- Execute commands against that target without visible activation.
- Close the owned target and restore focus on every exit path.

Acceptance criteria:

- Cleanup runs after success, command failure, timeout, and interruption.
- Nested scopes cannot close each other's targets.
- The scope never silently retargets a user tab.

### LM-003: Retry only idempotent browser operations

Priority: P2

Status: Confirmed downstream mitigation

Observed:

- Retrying the failed `wait --fn` once made the weekly command succeed.

Proposed behavior:

- Add bounded retry with short backoff for `wait`, `evaluate`, `snapshot`, and
  read-only tab discovery.
- Retry only known transient CDP codes or strings.
- Never retry clicks, form submissions, or other side effects automatically.
- Record retry count in debug output.

Acceptance criteria:

- The observed execution-context failure recovers automatically.
- A deterministic selector or parsing error still fails immediately.

### LM-004: `doctor` should verify execution readiness, not only connectivity

Priority: P2

Status: Confirmed

Observed:

- Native `doctor` returned `ok: true`.
- The next `posts week --no-details` command failed with no default execution
  context.
- A direct retry succeeded.

Problem:

- CDP connectivity, a supported binary, and a visible LinkedIn tab do not prove
  that the selected target has a usable execution context.

Proposed behavior:

- Report browser connection and execution readiness separately.
- Run a harmless evaluation against the intended worker target.
- Do not hijack a user tab merely to perform the readiness check.

Acceptance criteria:

- `doctor` distinguishes `connected`, `targetBound`, and `contextReady`.
- A transient context state is reported as degraded or retried.

### LM-005: Sanitize subprocess errors before exposing them

Priority: P3

Status: Confirmed

Observed:

- The failure output included the full `agent-browser` command and complete
  injected JavaScript passed to `wait --fn`.

Impact:

- Logs become noisy and expensive for agents.
- Future scripts could expose private selectors, page data, or inline values.
- Users see implementation detail instead of a concise action.

Proposed behavior:

- Prefer captured stderr over the generic `execFileSync` message.
- Emit a short operation name, stable code, and concise message.
- Put the full command and script behind `--debug`.

Acceptance criteria:

- Normal errors never echo the full injected script.
- Debug mode retains enough information for reproduction.

## Recommended implementation order

1. Implement LM-001, LM-002, LM-003, and LM-005 in `li-metrics`.
2. Add session evidence to upstream #1247 and #1530.
3. Open AB-003 as a focused reproducible bug.
4. Open AB-004 and AB-005 as API and UX follow-ups.
5. Update `li-metrics` to use upstream background mode once available.

The most noticeable improvement will come from combining background target
creation, strict target pinning, and one reusable worker tab. That turns the
automation from a visible browser takeover into an actual background workflow.
