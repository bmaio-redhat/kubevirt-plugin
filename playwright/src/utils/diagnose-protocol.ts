/**
 * Failure diagnosis harness for DIAGNOSE_FAILURES=1.
 *
 * On any test failure (timeout or assertion), the harness:
 * 1. Captures a screenshot + ARIA accessibility snapshot
 * 2. Spawns a Cursor SDK agent that inspects the evidence, checks cluster
 *    health and Jira via kubevirt-ui-mcp, and writes a structured verdict
 * 3. Falls back to heuristic classification if no CURSOR_API_KEY is set,
 *    @cursor/sdk is unavailable, or the agent fails
 *
 * The agent runs locally in the same workspace, has full MCP tool access,
 * and operates against the same browser state captured at failure time.
 */

import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

import type { Page, TestInfo } from '@playwright/test';
import { test as base } from '@playwright/test';

import { annotateAiDiagnosisInAllure } from './allure';
import { EnvVariables } from './env-variables';

const execFileAsync = promisify(execFile);

const DIAGNOSE_DIR = path.resolve(process.cwd(), 'test-results', 'diagnose');
const DEFAULT_MODEL = 'claude-sonnet-4-6';
/** Wall-clock budget for the isolated single-test retry used by API diagnosis. */
const API_RETRY_TIMEOUT_MS = 120_000;

export type DiagnoseVerdict = 'pass' | 'skip' | 'fail';

export interface DiagnoseResult {
  verdict: DiagnoseVerdict;
  reason: string;
  screenshot?: string;
  source: 'agent' | 'heuristic';
}

export interface DiagnoseVerdictFile {
  testId: string;
  verdict: DiagnoseVerdict;
  reason: string;
  evidence?: string[];
}

export interface RawTestError {
  message?: string;
  stack?: string;
  value?: string;
}

/**
 * Paths to the three PNGs Playwright generates on a `toHaveScreenshot()`
 * mismatch, extracted from `testInfo.attachments`. `diffPath` is absent when
 * Playwright couldn't produce a pixel diff at all (e.g. dimension mismatch).
 */
export interface VisualDiffAttachment {
  expectedPath: string;
  actualPath: string;
  diffPath?: string;
}

/**
 * Detects a `toHaveScreenshot()` failure and extracts the baseline/actual/diff
 * PNG paths Playwright already wrote to disk and attached to the test result.
 * Playwright names these `<snapshotName>-expected`, `<snapshotName>-actual`,
 * `<snapshotName>-diff` (see `toMatchSnapshot.ts` in `@playwright/test`) —
 * without this, the harness only ever sees a fresh, unrelated live screenshot
 * for visual regression failures, never the actual pixel comparison itself.
 */
function findVisualDiffAttachment(
  attachments: ReadonlyArray<{ name: string; contentType: string; path?: string }>,
): VisualDiffAttachment | null {
  const pathFor = (suffix: string): string | undefined =>
    attachments.find((a) => a.contentType.startsWith('image/') && a.name.endsWith(suffix) && a.path)
      ?.path;

  const expectedPath = pathFor('-expected');
  const actualPath = pathFor('-actual');
  if (!expectedPath || !actualPath) return null;

  return { expectedPath, actualPath, diffPath: pathFor('-diff') };
}

// --- Baseline tamper guard ---
//
// `visualDiff.expectedPath` is not a temp copy — it's the literal, committed
// baseline PNG under `playwright/tests/visual/__screenshots__/` (Playwright's
// own matcher resolves `expectedPath` to `resolvedPaths.absoluteSnapshotPath`,
// the real snapshot file used for every future comparison). The agent is a
// full local Cursor SDK agent with unrestricted read/write access to the
// whole repo (`Agent.create({ local: { cwd: process.cwd() } })` has no
// path-level sandboxing), and it is handed this exact path directly in the
// prompt so it can read the baseline for comparison. Nothing besides the
// prompt's instructions stops it from also overwriting that same path — the
// "never touch baselines" rule is enforced by wording alone unless we check.
// This mirrors the pass->skip verdict downgrade above: don't trust prompt
// compliance for an invariant this important, verify it.
function readFileBufferSafe(filePath: string): Buffer | null {
  try {
    return fs.readFileSync(filePath);
  } catch {
    return null;
  }
}

function buffersEqual(a: Buffer | null, b: Buffer | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.equals(b);
}

/**
 * Restores the baseline PNG to its pre-diagnosis bytes if the agent (or
 * anything else) modified or deleted it during the run. Returns a warning
 * string to fold into the verdict reason, or null if nothing was tampered.
 */
function restoreBaselineIfTampered(
  t: string,
  visualDiff: VisualDiffAttachment,
  baselineBefore: Buffer | null,
): string | null {
  const baselineAfter = readFileBufferSafe(visualDiff.expectedPath);
  if (buffersEqual(baselineBefore, baselineAfter)) return null;

  // eslint-disable-next-line no-console
  console.log(
    `${t} WARNING: baseline PNG changed during diagnosis (${visualDiff.expectedPath}) — reverting. Baselines are human-reviewed only, never agent-writable.`,
  );

  try {
    if (baselineBefore) {
      fs.writeFileSync(visualDiff.expectedPath, baselineBefore);
    } else if (fs.existsSync(visualDiff.expectedPath)) {
      // Didn't exist before diagnosis started — whatever created it during
      // the run shouldn't have; remove it rather than leave a new baseline
      // that was never reviewed.
      fs.unlinkSync(visualDiff.expectedPath);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(
      `${t} Failed to auto-revert tampered baseline: ${
        err instanceof Error ? err.message : err
      } — manual review required for ${visualDiff.expectedPath}`,
    );
  }

  return `[SAFETY: baseline PNG at ${visualDiff.expectedPath} was modified during diagnosis and has been auto-reverted — baseline updates must only happen via a human-reviewed --update-snapshots run]`;
}

const MAX_SOFT_ASSERTION_ERRORS = 8;
const MAX_ERROR_MESSAGE_LEN = 500;
const SPEC_LOCATION_PATTERN = /[\w./-]+\.spec\.ts:\d+:\d+/;

/**
 * Formats testInfo.errors into a single string for the diagnosis prompt.
 *
 * Tests in this codebase rely heavily on `expect.soft()`, so a single failed
 * test frequently carries MULTIPLE independent assertion failures at once
 * (Playwright accumulates all of them in `testInfo.errors`, it does not stop
 * at the first one). Each failure is rendered as its own numbered block with
 * a spec-file:line location (parsed from the stack) when available, so the
 * agent can diagnose — and, in autofix mode, fix — every failure rather than
 * only the first one that happens to fit in a naive joined-and-truncated blob.
 */
export function formatSoftAssertionErrors(errors: RawTestError[] | undefined): string {
  const entries = (errors ?? []).filter((e) => e && (e.message || e.value));
  if (entries.length === 0) return 'Test failed with assertion error(s)';

  const blocks = entries.slice(0, MAX_SOFT_ASSERTION_ERRORS).map((e, i) => {
    const rawMessage = e.message ?? e.value ?? 'Unknown error';
    const locationMatch = e.stack?.match(SPEC_LOCATION_PATTERN);
    const location = locationMatch ? ` (${locationMatch[0]})` : '';
    return `[Assertion ${i + 1}${location}]\n${rawMessage.slice(0, MAX_ERROR_MESSAGE_LEN)}`;
  });

  const overflow = entries.length - MAX_SOFT_ASSERTION_ERRORS;
  const overflowNote =
    overflow > 0 ? `\n\n...and ${overflow} more assertion failure(s), truncated.` : '';

  return `${entries.length} assertion failure(s) detected in this test:\n\n${blocks.join(
    '\n\n',
  )}${overflowNote}`;
}

// --- Infrastructure heuristics ---

const INFRA_ERROR_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /401.*Unauthorized/i, reason: 'Auth token expired (401 Unauthorized)' },
  { pattern: /403.*Forbidden/i, reason: 'Access denied (403 Forbidden)' },
  { pattern: /504.*Gateway/i, reason: 'Cluster instability (504 Gateway Timeout)' },
  { pattern: /502.*Bad Gateway/i, reason: 'Cluster instability (502 Bad Gateway)' },
  { pattern: /etcdserver.*request timed out/i, reason: 'etcd timeout — cluster under load' },
  { pattern: /net::ERR_CONNECTION_REFUSED/i, reason: 'Connection refused — cluster unreachable' },
  { pattern: /net::ERR_TIMED_OUT/i, reason: 'Network timeout — cluster unreachable' },
  {
    pattern: /net::ERR_NAME_NOT_RESOLVED/i,
    reason: 'DNS resolution failed — cluster unreachable',
  },
  {
    pattern: /Navigation timeout.*exceeded/i,
    reason: 'Page navigation timeout — cluster or console unreachable',
  },
];

const AUTH_URL_PATTERNS = [/\/oauth\//, /\/login/, /\/auth\//, /idp.*select/i];

// --- File I/O ---

function ensureDir(): void {
  if (!fs.existsSync(DIAGNOSE_DIR)) {
    fs.mkdirSync(DIAGNOSE_DIR, { recursive: true });
  }
}

export function getScreenshotPath(testId: string): string {
  ensureDir();
  return path.join(DIAGNOSE_DIR, `screenshot-${testId}.png`);
}

function getVerdictPath(testId: string): string {
  return path.join(DIAGNOSE_DIR, `verdict-${testId}.json`);
}

function readVerdictFile(testId: string): DiagnoseVerdictFile | null {
  try {
    const raw = fs.readFileSync(getVerdictPath(testId), 'utf-8');
    return JSON.parse(raw) as DiagnoseVerdictFile;
  } catch {
    return null;
  }
}

// --- Heuristic classifiers ---

function classifyByError(errorMsg: string): DiagnoseResult | null {
  for (const { pattern, reason } of INFRA_ERROR_PATTERNS) {
    if (pattern.test(errorMsg)) {
      return { verdict: 'skip', reason, source: 'heuristic' };
    }
  }
  return null;
}

function classifyByUrl(pageUrl: string): DiagnoseResult | null {
  for (const pattern of AUTH_URL_PATTERNS) {
    if (pattern.test(pageUrl)) {
      return {
        verdict: 'skip',
        reason: `Auth session expired — redirected to ${pageUrl}`,
        source: 'heuristic',
      };
    }
  }
  return null;
}

function heuristicFallback(
  pageUrl: string,
  method: string,
  errorMsg: string,
  defaultVerdict: DiagnoseVerdict,
  screenshotPath: string,
): DiagnoseResult {
  const urlResult = classifyByUrl(pageUrl);
  if (urlResult) return { ...urlResult, screenshot: screenshotPath };

  const errorResult = classifyByError(errorMsg);
  if (errorResult) return { ...errorResult, screenshot: screenshotPath };

  const label = defaultVerdict === 'skip' ? `Timeout in ${method}` : 'Assertion failure';
  // Skip the "N assertion failure(s) detected..." header line so the reason
  // surfaces actual error content, not just the summary count.
  const detail = errorMsg.split('\n').slice(1).join(' ').trim() || errorMsg;
  return {
    verdict: defaultVerdict,
    reason: `${label}: ${detail.slice(0, 300)}`,
    screenshot: screenshotPath,
    source: 'heuristic',
  };
}

// --- Cursor SDK agent ---

function buildPrompt(
  testTitle: string,
  specFile: string,
  method: string,
  errorMsg: string,
  pageUrl: string,
  jiraIds: string[],
  screenshotPath: string,
  ariaSnapshot: string,
  verdictPath: string,
  testId: string,
  cdpPort: number | null,
  targetId: string,
  visualDiff: VisualDiffAttachment | null,
): string {
  return `You are a test failure diagnosis agent. A Playwright E2E test failed and you must determine the cause and write a verdict file.

The test is currently paused — the browser is still open${
    cdpPort ? ` and you have live access to it via playwright-cli on CDP port ${cdpPort}` : ''
  }.

## Test Details
- **Title:** ${testTitle}
- **Spec:** ${specFile}
- **Method that failed:** ${method}
- **Page URL at failure:** ${pageUrl}
- **Browser CDP target ID:** ${targetId}
- **Jira IDs:** ${jiraIds.length ? jiraIds.join(', ') : 'none'}

## Error(s)

This project uses \`expect.soft()\` extensively, so this test may have **multiple independent assertion failures** rather than just one — Playwright does not stop at the first \`expect.soft()\` failure, it collects all of them. Each failure below is numbered (\`[Assertion N]\`) with its spec file location when available. Treat each one as a separate thing to diagnose.

\`\`\`
${errorMsg.slice(0, 4000)}
\`\`\`

## Page Accessibility Tree (ARIA Snapshot at failure time)
\`\`\`yaml
${ariaSnapshot.slice(0, 3000)}
\`\`\`

${
  cdpPort
    ? `## Live Browser Access

The test browser is accessible via CDP on port ${cdpPort}. Connect to it:

\\\`\\\`\\\`bash
npx playwright-cli attach --cdp http://localhost:${cdpPort}
\\\`\\\`\\\`

(Always invoke it as \`npx playwright-cli\`, never a bare \`playwright-cli\` — this project depends on \`@playwright/cli\` locally specifically so \`npx\` can resolve it from \`node_modules/.bin\` regardless of whether it happens to be on your shell's PATH.)

**IMPORTANT — verify you landed on the correct tab before inspecting.** The worker's browser context may have more than one page open. Attaching connects to the browser, not a specific tab:

\\\`\\\`\\\`bash
npx playwright-cli tab-list   # list all open tabs with their URLs
\\\`\\\`\\\`

Compare each tab's URL against the expected page URL above (\`${pageUrl}\`). If the current/active tab does not match, switch to the one that does:

\\\`\\\`\\\`bash
npx playwright-cli tab-select <index>   # index of the tab matching the expected URL
\\\`\\\`\\\`

If no open tab matches the expected URL (e.g. it already navigated or closed), say so explicitly in your verdict reason instead of guessing from the wrong tab.

Once you've confirmed the correct tab, use these commands to inspect the live page state:

\\\`\\\`\\\`bash
npx playwright-cli snapshot              # current accessibility tree
npx playwright-cli console error         # browser console errors — JS crashes, plugin failures
npx playwright-cli console warning       # browser warnings — version mismatches, deprecations
npx playwright-cli requests              # list network requests — look for failed API calls (4xx/5xx)
npx playwright-cli request <n>           # inspect a specific request (headers + response body)
npx playwright-cli eval "document.title" # evaluate JS on the page
npx playwright-cli screenshot --filename=test-results/diagnose/live-${testId}.png  # capture current state
\\\`\\\`\\\``
    : `## Note
CDP debugging port was not detected — live browser inspection is not available. Rely on the screenshot and ARIA snapshot above.`
}
${
  visualDiff
    ? `
## Visual Regression — Screenshot Comparison Failure

This failure is a Playwright \`toHaveScreenshot()\` pixel comparison from the deterministic Visual Regression suite (mocked API data, no live cluster state — the CDP/browser tools above still work if you need to check what today's live render actually looks like). Read all of these images before deciding:

- **Baseline (committed, expected):** \`${visualDiff.expectedPath}\`
- **New capture (actual, this run):** \`${visualDiff.actualPath}\`${
        visualDiff.diffPath
          ? `\n- **Pixel diff highlight (differing pixels marked):** \`${visualDiff.diffPath}\``
          : '\n- No diff image was generated (e.g. dimension mismatch) — compare baseline vs actual directly.'
      }

Classify the mismatch as exactly one of:

1. **Unmasked dynamic content** — the diff region is a timestamp, relative time ("2 minutes ago"), generated resource name/UID, sync indicator, spinner/animation frame, or other content that legitimately varies between runs even with mocked data. This is a **test bug** (missing \`mask\`), never a product bug.
2. **Rendering noise** — small, scattered pixel differences with no semantic content change (anti-aliasing, sub-pixel font hinting, GPU differences). Not fixable by masking — would need a slightly higher \`maxDiffPixelRatio\`/\`threshold\`, which you should only recommend, not apply blindly.
3. **Genuine layout/style regression** — an element moved, resized, recolored, restyled, or is missing/added compared to the baseline. Describe precisely what changed (which element, what property, roughly how much) so a human can decide whether it's an intentional UI change (needs \`--update-snapshots\` after review) or a real bug.

### Verdict mapping for visual regressions — stricter than normal assertions

- **NEVER return \`"pass"\`** here, even for case 1 or 2. A screenshot that doesn't match today's committed baseline must never be silently accepted as passing — that defeats the entire purpose of a pixel comparison. (The harness forcibly downgrades any \`"pass"\` verdict on a screenshot-diff failure to \`"skip"\` regardless, so don't bother trying.)
- Case 1 or 2 → \`"skip"\` (test/environment issue — needs a mask or threshold change, not a product bug)
- Case 3 → \`"fail"\` (real visual change — flag for human review, do not attempt to resolve it yourself)
- Never touch anything under \`playwright/tests/visual/__screenshots__/\` — baseline updates only ever happen via an explicit \`--update-snapshots\` run that a human reviews image-by-image, never as an automated or agent-driven edit.
`
    : ''
}
## Instructions

1. **Read the screenshot** at \`${screenshotPath}\` to see the visual state at failure time.

2. **Attach to the live browser** via \`npx playwright-cli attach --cdp http://localhost:${
    cdpPort || 9222
  }\` (always \`npx playwright-cli\`, never a bare \`playwright-cli\`), then:
   - Run \`tab-list\` and confirm a tab's URL matches the expected page URL (\`${pageUrl}\`) — \`tab-select\` the correct one if there are multiple open tabs
   - Run \`snapshot\` to see the current element tree
   - Run \`console error\` to check for JS errors
   - Run \`requests\` to find failed API calls (401, 403, 404, 500, 504)

3. **Check cluster health** using the \`kubevirt-ui-mcp\` tool \`check_cluster_health\` — look for degraded CNV operator, unreachable API server, or unready nodes.

4. **Cross-reference Jira** if IDs are present — use \`get_ticket\` from \`kubevirt-ui-mcp\` to check if the ticket's feature is known-broken or environment-dependent.

5. **Diagnose EACH \`[Assertion N]\` block separately**, then classify the overall failure${
    visualDiff
      ? ' (see the "Visual Regression" section above instead — it overrides this generic classification for screenshot-diff failures)'
      : ''
  }:
   - \`"skip"\` — Environmental issue: auth expired (page shows login), missing StorageClass, cluster degraded, infrastructure error (401/504/etcd). **Default when uncertain.**
   - \`"fail"\` — Product bug: the page loaded correctly but the expected element is missing, broken, or wrong. No existing Jira ticket explains it.
   - \`"pass"\` — False positive: the screenshot or live browser shows the feature working correctly. The test assertion is stale (wrong selector, changed label, timing issue). **Only with positive visual evidence.**

   **When there are multiple \`[Assertion N]\` blocks, apply this precedence — never let one stale assertion mask a real bug in another:**
   - If **any** assertion is a genuine product bug → overall verdict is \`"fail"\`, even if other assertions in the same test are stale or environmental. Name which assertion(s) are the real bug in the reason.
   - Else if **any** assertion is environmental (and none are product bugs) → overall verdict is \`"skip"\`.
   - Only use \`"pass"\` when **every single** \`[Assertion N]\` is confirmed stale with positive visual evidence — one unverified or genuinely-broken assertion disqualifies \`"pass"\` for the whole test.
   - In the \`"reason"\` field, briefly account for every assertion block (e.g. "Assertion 1: stale selector, fixed. Assertion 2: real bug — filter dropdown missing, no Jira ticket found.").

6. **Detach from the browser** when done: \`npx playwright-cli detach\`

7. **Write the verdict file** at exactly this path: \`${verdictPath}\`

The file must contain this exact JSON structure:
\`\`\`json
{
  "testId": "${testId}",
  "verdict": "skip",
  "reason": "Your concise analysis here",
  "evidence": []
}
\`\`\`

IMPORTANT:
- Do NOT use Playwright MCP browser tools (browser_navigate, browser_click, browser_snapshot, etc.) — they spawn a separate browser. Use \`npx playwright-cli attach --cdp\` for the live test browser.
- Be fast and decisive. Write the verdict file and stop.${
    process.env.DIAGNOSE_AUTOFIX === '1'
      ? `

## Autofix Mode (ENABLED)

You have WRITE access to test and framework files. If your overall verdict is \`"pass"\`, every \`[Assertion N]\` was stale — you MUST fix the root cause of **all of them**, not just the first. If the overall verdict is \`"fail"\` because at least one assertion is a real bug, you MAY still fix the OTHER assertions that are independently confirmed stale (list them in evidence), but do NOT flip the overall verdict to \`"pass"\` — a real bug elsewhere in the same test still fails the test.

### What to fix and where

| Root cause | Fix in | Example |
|-----------|--------|---------|
| Wrong expected value in assertion | \`.spec.ts\` | \`.toBe(false)\` → \`.toBe(true)\` |
| Stale \`data-test\` / \`data-test-id\` selector | Page object or component in \`src/page-objects/\` or \`src/components/\` | \`data-test="old-id"\` → \`data-test="new-id"\` |
| Changed element role or accessible name | Page object locator method | \`getByRole('button', { name: 'Old' })\` → \`{ name: 'New' }\` |
| Wrong URL pattern in navigation | Page object \`goto\` / \`navigate\` method | Update the URL path constant |
| Outdated expected text or label | \`.spec.ts\` or page object verification method | Update the expected string |
| Stale timeout or wait condition | \`.spec.ts\` or page object | Adjust wait selector or condition |${
          visualDiff
            ? `
| Unmasked dynamic content in a visual regression test (case 1 above) | \`.spec.ts\` — add to the \`mask: [...]\` array of the failing \`toHaveScreenshot()\` call | \`mask: [page.locator('[data-test="last-sync-time"]')]\` |`
            : ''
        }

### Rules

- Use \`npx playwright-cli snapshot\` and \`npx playwright-cli eval\` to discover the ACTUAL selectors and element names in the live DOM — match the fix to what the UI currently renders
- Only change the minimal lines needed — do not refactor or reformat
- Re-read the target file immediately before writing — if the stale content you diagnosed is already gone (another worker's agent fixed it first), do not write; just note "already fixed" in the reason
- Do NOT modify \`scenario-test-fixture.ts\`, \`base-page.ts\`, clients, or data factories — these are shared by every test in the suite, so a fix that looks correct for this one failure can silently break unrelated call sites${
          visualDiff
            ? `
- A visual regression fix is scoped to adding a \`mask\` entry ONLY — never edit \`playwright/tests/visual/__screenshots__/*.png\` (baseline PNGs), and never run or emulate \`--update-snapshots\`. Adding a mask fixes future runs; it does not and must not change this run's verdict away from \`"skip"\`/\`"fail"\`.`
            : ''
        }
- Fix every stale assertion you found, even across multiple \`[Assertion N]\` blocks in the same failure
- Record ALL changed files in the verdict \`"reason"\` field
- Add every changed file path to the verdict \`"evidence"\` array`
      : `
- Do NOT modify any test code or framework files.`
  }`;
}

/**
 * Resolves the diagnosis agent's own timeout. An explicit
 * DIAGNOSE_AGENT_TIMEOUT_MS always wins; otherwise the agent gets the same
 * timeout budget the failing test itself was configured with, since the
 * agent's workload (CDP attach, playwright-cli, kubevirt-ui-mcp calls under
 * concurrent-worker contention) scales with the same factors the test's own
 * timeout was already sized for.
 */
function resolveAgentTimeoutMs(testInfo: TestInfo | null): number {
  const override = EnvVariables.diagnoseAgentTimeoutOverrideMs;
  if (override !== null) return override;
  if (testInfo?.timeout) return testInfo.timeout;
  return EnvVariables.diagnoseAgentFallbackTimeoutMs;
}

/**
 * Generic Cursor SDK agent lifecycle: create, send a prompt, race against the
 * resolved timeout, cancel+close on timeout, and read back the verdict file.
 * Shared by both the browser-based UI diagnosis (`spawnAgent`) and the
 * browserless API diagnosis (`spawnApiAgent`) — everything here is
 * prompt-agnostic; each caller builds its own prompt and attaches its own
 * evidence field (screenshot, etc.) to the returned verdict.
 */
async function runAgentAndGetVerdict(
  prompt: string,
  testId: string,
  testTitle: string,
  t: string,
): Promise<Pick<DiagnoseResult, 'verdict' | 'reason'> | null> {
  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    // eslint-disable-next-line no-console
    console.log(`${t} No CURSOR_API_KEY — skipping agent, using heuristic`);
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let Agent: typeof import('@cursor/sdk').Agent;
  try {
    const sdk = await import('@cursor/sdk');
    Agent = sdk.Agent;
  } catch {
    // eslint-disable-next-line no-console
    console.log(`${t} @cursor/sdk not available — using heuristic`);
    return null;
  }

  const model = process.env.DIAGNOSE_MODEL || DEFAULT_MODEL;

  let testInfo: TestInfo | null = null;
  try {
    testInfo = base.info();
  } catch {
    /* outside test context — resolveAgentTimeoutMs falls back to a flat default */
  }

  const agentTimeoutMs = resolveAgentTimeoutMs(testInfo);

  // Extend the failing test's own Playwright timeout to cover the agent's
  // budget — otherwise Playwright's per-test timeout can kill the whole test
  // (and the worker along with it) mid-diagnosis, regardless of the agent's
  // own internal timeout below.
  if (testInfo) {
    try {
      testInfo.setTimeout(testInfo.timeout + agentTimeoutMs);
    } catch {
      /* test may already be past its timeout / teardown — best effort only */
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `${t} Spawning diagnosis agent (model: ${model}, timeout: ${agentTimeoutMs}ms) for: ${testTitle}...`,
  );

  // Use Agent.create()+send() instead of the one-shot Agent.prompt() so a
  // timeout can actually cancel the run and dispose the agent below.
  // Agent.prompt() disposes for you ONLY once its returned promise settles —
  // Promise.race never cancels the losing side, so racing Agent.prompt()
  // against our own timer would leave an orphaned agent (and its local
  // executor process) running in the background indefinitely: still calling
  // playwright-cli/MCP tools against a page whose test may have already
  // ended.
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let agent: import('@cursor/sdk').SDKAgent | null = null;
  try {
    agent = await Agent.create({
      apiKey,
      model: { id: model },
      local: { cwd: process.cwd(), settingSources: ['project'] },
    });

    const run = await agent.send(prompt);
    const TIMED_OUT = Symbol('diagnose-agent-timeout');
    const raceResult = await Promise.race([
      run.wait(),
      new Promise<typeof TIMED_OUT>((resolve) => {
        setTimeout(() => resolve(TIMED_OUT), agentTimeoutMs);
      }),
    ]);

    if (raceResult === TIMED_OUT) {
      // eslint-disable-next-line no-console
      console.log(`${t} Agent diagnosis timed out after ${agentTimeoutMs}ms — cancelling run`);
      if (run.supports('cancel')) {
        try {
          await run.cancel();
        } catch (cancelErr) {
          // eslint-disable-next-line no-console
          console.log(
            `${t} Failed to cancel timed-out run: ${
              cancelErr instanceof Error ? cancelErr.message : cancelErr
            }`,
          );
        }
      }
      return null;
    }

    const agentResult = raceResult;
    if (agentResult.status === 'finished') {
      const verdict = readVerdictFile(testId);
      if (verdict) {
        return { verdict: verdict.verdict, reason: verdict.reason };
      }
      // eslint-disable-next-line no-console
      console.log(`${t} Agent finished but no verdict file found`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`${t} Agent run status: ${agentResult.status}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`${t} Agent error: ${err instanceof Error ? err.message : err}`);
  } finally {
    if (agent) {
      try {
        agent.close();
      } catch {
        /* best-effort cleanup only */
      }
    }
  }

  return null;
}

async function spawnAgent(
  testTitle: string,
  specFile: string,
  method: string,
  errorMsg: string,
  pageUrl: string,
  jiraIds: string[],
  screenshotPath: string,
  ariaSnapshot: string,
  testId: string,
  t: string,
  cdpPort: number | null,
  targetId: string,
  visualDiff: VisualDiffAttachment | null,
): Promise<DiagnoseResult | null> {
  const verdictPath = getVerdictPath(testId);
  const prompt = buildPrompt(
    testTitle,
    specFile,
    method,
    errorMsg,
    pageUrl,
    jiraIds,
    screenshotPath,
    ariaSnapshot,
    verdictPath,
    testId,
    cdpPort,
    targetId,
    visualDiff,
  );

  const result = await runAgentAndGetVerdict(prompt, testId, testTitle, t);
  if (!result) return null;
  return { ...result, screenshot: screenshotPath, source: 'agent' };
}

// --- API diagnosis (browserless) ---
//
// API tests (`playwright/tests/api/`) have no page/browser — `apiClient`
// makes raw HTTP calls via `RequestContextClient`. There's no screenshot,
// ARIA snapshot, or live browser tab to attach to at failure time, so this
// path is structurally different from the UI diagnosis above:
//
// 1. Repeat the exact failing test once, in isolation, to separate a
//    reproducible failure from a transient blip — cheap, deterministic,
//    zero LLM cost.
// 2. Only escalate to the agent if the failure is reproducible. The agent's
//    job is then to find which UI page(s) consume the same endpoint/resource
//    and open its OWN fresh playwright-cli session (no existing test browser
//    to attach to) to check for real, user-visible ramifications.

/**
 * Re-runs the exact failing API test once, in an isolated child `playwright
 * test` process, to distinguish a reproducible failure from a transient blip
 * (auth token refresh race, momentary 5xx, etc.) before spending an agent
 * call on it.
 *
 * `SKIP_GLOBAL_SETUP=true` reuses the `.test-config.json` + auth cookies the
 * parent run's global setup already wrote to disk — re-running the full
 * global setup (browser login, namespace/user provisioning) just to retry
 * one test would be slow and would itself mutate cluster state. All other
 * env vars (`NON_PRIV`, `SKIP_BROWSER_SETUP`, etc.) are inherited from the
 * parent process so the retry authenticates as the same user.
 *
 * If the retried test itself creates cluster resources, it cleans them up
 * via its own normal fixture teardown, same as any other single run of that
 * test — this is not a resource leak, just a duplicate transient side effect.
 */
async function retryFailingTest(
  specFile: string,
  testTitle: string,
  projectName: string,
  t: string,
): Promise<{ reproducible: boolean; output: string }> {
  const escapedTitle = testTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const args = [
    'playwright',
    'test',
    specFile,
    '--config=playwright/playwright.config.ts',
    `--project=${projectName}`,
    '--grep',
    escapedTitle,
    '--workers=1',
    '--retries=0',
    '--reporter=line',
  ];

  // eslint-disable-next-line no-console
  console.log(`${t} Repeating the test once in isolation to check reproducibility...`);

  try {
    await execFileAsync('npx', args, {
      cwd: process.cwd(),
      timeout: API_RETRY_TIMEOUT_MS,
      env: { ...process.env, SKIP_GLOBAL_SETUP: 'true' },
      maxBuffer: 10 * 1024 * 1024,
    });
    // eslint-disable-next-line no-console
    console.log(`${t} Retry PASSED — original failure looks transient/flaky`);
    return { reproducible: false, output: '(retry passed on the second attempt)' };
  } catch (err) {
    const asExecErr = err as { stdout?: string; stderr?: string; killed?: boolean };
    const output = `${asExecErr.stdout ?? ''}\n${asExecErr.stderr ?? ''}`.trim() || String(err);
    // eslint-disable-next-line no-console
    console.log(
      `${t} Retry FAILED${
        asExecErr.killed ? ' (timed out)' : ''
      } — reproducible, escalating to full diagnosis`,
    );
    return { reproducible: true, output: output.slice(-4000) };
  }
}

function buildApiPrompt(
  testTitle: string,
  specFile: string,
  errorMsg: string,
  jiraIds: string[],
  retryOutput: string,
  verdictPath: string,
  testId: string,
): string {
  return `You are a test failure diagnosis agent for a BROWSERLESS API contract test. This test failed twice — once on the normal run and again on an immediate, isolated retry — so this is a REPRODUCIBLE failure, not a transient blip.

There is no live browser or page for this test (API tests talk directly to the OpenShift console proxy via HTTP, no page object involved), so your job is different from UI diagnosis: determine whether this API-level failure has USER-VISIBLE ramifications in the actual UI, not just inspect a paused browser tab.

## Test Details
- **Title:** ${testTitle}
- **Spec:** ${specFile}
- **Jira IDs:** ${jiraIds.length ? jiraIds.join(', ') : 'none'}

## Error (reproduced on both the original run and an isolated retry)
\`\`\`
${errorMsg.slice(0, 4000)}
\`\`\`

## Retry output (same failure reproduced in isolation — SKIP_GLOBAL_SETUP=true, --workers=1, --retries=0)
\`\`\`
${retryOutput.slice(0, 2000)}
\`\`\`

## Step 0 — rule out infrastructure
Use the \`kubevirt-ui-mcp\` tool \`check_cluster_health\` — a degraded CNV operator, unreachable API server, or an expired auth token can produce exactly this kind of reproducible failure without indicating a real product bug. If infra is degraded, verdict is \`"skip"\` and you can stop here.

## Step 1 — find which UI module(s) consume the same endpoint/resource
Read the failing spec under \`playwright/tests/api/\` to identify the exact console-proxy endpoint/resource kind it exercises (via the \`apiClient\`/\`RequestContextClient\` method names it calls). Then use \`kubevirt-ui-mcp\`'s \`get_coverage_for_feature\` and \`search_methods\`, or search directly in \`playwright/src/clients/handlers/\` and \`playwright/src/page-objects/\`, to find which UI page object(s)/component(s) hit the SAME endpoint or resource kind. Identify the corresponding live UI page(s) to check next.

## Step 2 — check the live UI for ramifications
There is no existing test browser for this test to attach to (API tests are browserless) — start a FRESH playwright-cli session instead. Always invoke it as \`npx playwright-cli\`, never a bare \`playwright-cli\` — this project depends on \`@playwright/cli\` locally specifically so \`npx\` can resolve it from \`node_modules/.bin\` regardless of your shell's PATH:
\`\`\`bash
npx playwright-cli open --config=.playwright/cli.config.json "$(grep ^WEB_CONSOLE_URL .env | cut -d= -f2-)"
npx playwright-cli state-load playwright/mcp-validations/.auth/openshift-state.json
\`\`\`
(If the saved auth state is missing or expired, log in manually first, then \`npx playwright-cli state-save playwright/mcp-validations/.auth/openshift-state.json\`.)

Navigate to the UI module(s) identified in Step 1 and look for real, user-visible ramifications:
- \`npx playwright-cli snapshot\` — is the page/table/form actually broken, empty, or missing data it should have?
- \`npx playwright-cli console error\` — JS errors caused by the same bad response?
- \`npx playwright-cli requests\` — does the UI's OWN request to this endpoint also come back wrong (same status/shape), or does the UI call it differently (different params, caching, graceful error handling) and render fine anyway?

Close the session when done (\`npx playwright-cli tab-close\` or close the browser) — do not leave it running.

## Step 3 — classify

- \`"fail"\` — **UI ramification confirmed.** The same broken behavior (error, missing data, broken page) is visible to a real user in the module you checked. This is a real product bug with user impact — describe exactly what's broken and where.
- \`"skip"\` — **No UI ramification found**, or infra is degraded (Step 0). The UI page loads and functions normally despite the API-level mismatch — e.g. the UI doesn't consume the specific field/status this test checks, or handles the error gracefully. Still worth tracking as a contract-level issue, but not currently visible to end users. If the test assertion looks like it's checking an implementation detail no UI consumes, say so.
- \`"pass"\` — **Only** with positive evidence from the retry's actual response body (or product docs) that the test's expected value is simply outdated (e.g. a field was intentionally renamed/removed and the rest of the response is correct). Never use \`"pass"\` just because the UI happens to look fine — a reproducible contract mismatch is real evidence something changed, even when the UI masks it.

## Write the verdict file at exactly this path: \`${verdictPath}\`

\`\`\`json
{
  "testId": "${testId}",
  "verdict": "skip",
  "reason": "Your concise analysis here — MUST state which UI module you checked and what you found there, even for \\"skip\\"/\\"pass\\" verdicts.",
  "evidence": []
}
\`\`\`

IMPORTANT:
- Do NOT use Playwright MCP browser tools (browser_navigate, browser_click, etc.) — use \`npx playwright-cli\` for the fresh session in Step 2.
- Be fast and decisive. Write the verdict file and stop.${
    process.env.DIAGNOSE_AUTOFIX === '1'
      ? `

## Autofix Mode (ENABLED)

If your verdict is \`"pass"\` (stale assertion), fix it — update the expected value/field in the \`.spec.ts\` file to match the actual, correct response shape you confirmed via the retry output.

### Rules
- Only edit the failing test's \`.spec.ts\` file. Do NOT modify \`RequestContextClient\`, \`KubernetesClient\`, any file under \`src/clients/\`, or \`api-test-fixture.ts\` — these are shared by every API test in the suite, so a fix that looks right for this one failure can silently break unrelated call sites.
- Only change the minimal lines needed.
- Record the changed file in the verdict \`"reason"\` and \`"evidence"\`.`
      : `

- Do NOT modify any test code or framework files.`
  }`;
}

async function spawnApiAgent(
  testTitle: string,
  specFile: string,
  errorMsg: string,
  jiraIds: string[],
  retryOutput: string,
  testId: string,
  t: string,
): Promise<DiagnoseResult | null> {
  const verdictPath = getVerdictPath(testId);
  const prompt = buildApiPrompt(
    testTitle,
    specFile,
    errorMsg,
    jiraIds,
    retryOutput,
    verdictPath,
    testId,
  );

  const result = await runAgentAndGetVerdict(prompt, testId, testTitle, t);
  if (!result) return null;
  return { ...result, source: 'agent' };
}

// --- Diagnostic data collection ---

async function collectAriaSnapshot(page: Page): Promise<string> {
  try {
    return await page.ariaSnapshot();
  } catch {
    return '(snapshot unavailable)';
  }
}

interface BrowserIdentity {
  /** Short form (first 8 chars) — used only for the `[DiagnoseHarness:xxxx]` log tag. */
  targetId: string;
  /** Full CDP target ID — passed to the agent so it can cross-check the correct tab. */
  fullTargetId: string;
  cdpPort: number | null;
}

async function getBrowserIdentity(page: Page): Promise<BrowserIdentity> {
  try {
    const cdp = await page.context().newCDPSession(page);
    const targetInfo = (await cdp.send('Target.getTargetInfo')) as {
      targetInfo: { targetId: string; url: string };
    };

    let cdpPort: number | null = null;
    try {
      const browserInfo = (await cdp.send('Browser.getVersion')) as {
        webSocketDebuggerUrl?: string;
      };
      if (browserInfo.webSocketDebuggerUrl) {
        const match = browserInfo.webSocketDebuggerUrl.match(/:(\d+)\//);
        if (match) cdpPort = parseInt(match[1], 10);
      }
    } catch {
      /* Browser.getVersion may not expose the URL on all builds */
    }

    await cdp.detach();
    const fullTargetId = targetInfo.targetInfo.targetId;
    return { targetId: fullTargetId.slice(0, 8), fullTargetId, cdpPort };
  } catch {
    return { targetId: 'unknown', fullTargetId: 'unknown', cdpPort: null };
  }
}

function tag(browserId: string): string {
  return `[DiagnoseHarness:${browserId}]`;
}

// --- Public API ---

/**
 * Diagnose a timeout error caught by withSafeActions.
 *
 * 1. Captures screenshot + ARIA snapshot for diagnostic context
 * 2. Spawns a Cursor SDK agent to analyze and produce a verdict
 * 3. Falls back to heuristic classification if agent is unavailable or fails
 */
export async function diagnoseTimeout(
  page: Page,
  method: string,
  errorMsg: string,
  testId: string,
  testTitle: string,
  specFile: string,
  jiraIds: string[],
): Promise<DiagnoseResult> {
  const { targetId, fullTargetId, cdpPort } = await getBrowserIdentity(page);
  const t = tag(targetId);
  const screenshotPath = getScreenshotPath(testId);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

  const ariaSnapshot = await collectAriaSnapshot(page);
  const pageUrl = page.url();

  // eslint-disable-next-line no-console
  console.log(`${t} ${testTitle} — timeout in ${method}`);

  const agentResult = await spawnAgent(
    testTitle,
    specFile,
    method,
    errorMsg,
    pageUrl,
    jiraIds,
    screenshotPath,
    ariaSnapshot,
    testId,
    t,
    cdpPort,
    fullTargetId,
    null, // timeouts never produce a toHaveScreenshot() diff — no visual attachments to look for
  );

  let result: DiagnoseResult;
  if (agentResult) {
    result = agentResult;
  } else {
    // eslint-disable-next-line no-console
    console.log(`${t} Falling back to heuristic classification`);
    result = heuristicFallback(pageUrl, method, errorMsg, 'skip', screenshotPath);
  }

  // eslint-disable-next-line no-console
  console.log(`${t} Verdict: ${result.verdict} (${result.source}) — ${result.reason}`);
  await annotateAiDiagnosisInAllure({
    verdict: result.verdict,
    reason: result.reason,
    source: result.source,
    method,
  });
  return result;
}

/**
 * Diagnose an assertion failure (hard or soft expect).
 *
 * Same two-tier approach: agent first, heuristic fallback. When the failure
 * came from a `toHaveScreenshot()` visual regression mismatch, `attachments`
 * lets this pull the baseline/actual/diff PNGs Playwright already generated
 * so the agent can reason about the pixel diff itself instead of only seeing
 * a fresh, unrelated live screenshot. A `"pass"` verdict is never honored for
 * a screenshot-diff failure — see the downgrade below.
 */
export async function diagnoseAssertion(
  page: Page,
  errorMsg: string,
  testId: string,
  testTitle: string,
  specFile: string,
  jiraIds: string[],
  attachments: ReadonlyArray<{ name: string; contentType: string; path?: string }> = [],
): Promise<DiagnoseResult> {
  const { targetId, fullTargetId, cdpPort } = await getBrowserIdentity(page);
  const t = tag(targetId);
  const screenshotPath = getScreenshotPath(testId);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

  const ariaSnapshot = await collectAriaSnapshot(page);
  const pageUrl = page.url();
  const visualDiff = findVisualDiffAttachment(attachments);
  // Captured BEFORE the agent runs so any change we see after is attributable
  // to this diagnosis run, not to whatever produced the failure in the first
  // place (e.g. Playwright's own "write missing snapshot" behavior already
  // happened earlier, inside the failing `expect()` call itself).
  const baselineBefore = visualDiff ? readFileBufferSafe(visualDiff.expectedPath) : null;

  // eslint-disable-next-line no-console
  console.log(
    `${t} ${testTitle} — ${
      visualDiff ? 'visual regression (screenshot diff)' : 'assertion'
    } failure`,
  );

  const agentResult = await spawnAgent(
    testTitle,
    specFile,
    'assertion',
    errorMsg,
    pageUrl,
    jiraIds,
    screenshotPath,
    ariaSnapshot,
    testId,
    t,
    cdpPort,
    fullTargetId,
    visualDiff,
  );

  let result: DiagnoseResult;
  if (agentResult) {
    result = agentResult;
  } else {
    // eslint-disable-next-line no-console
    console.log(`${t} Falling back to heuristic classification`);
    result = heuristicFallback(pageUrl, 'assertion', errorMsg, 'fail', screenshotPath);
  }

  // Defense in depth: a screenshot comparison must never be silently accepted
  // as passing, no matter what the agent (or a future heuristic) returns —
  // relying on prompt compliance alone isn't enough for an invariant this
  // important. A "dynamic content, needs a mask" finding is still a "skip"
  // (test issue), never a "pass" (the baseline still doesn't match today).
  if (visualDiff && result.verdict === 'pass') {
    // eslint-disable-next-line no-console
    console.log(`${t} Downgrading pass -> skip: screenshot-diff failures are never auto-passed`);
    result = {
      ...result,
      verdict: 'skip',
      reason: `[Downgraded pass→skip: screenshot comparisons are never auto-passed] ${result.reason}`,
    };
  }

  // Second, independent defense in depth: verify the baseline PNG itself
  // wasn't touched, rather than trusting the "never touch baselines"
  // instruction in the prompt. The agent has unrestricted filesystem access
  // and was handed this exact path — nothing else stops a write to it.
  if (visualDiff) {
    const tamperNote = restoreBaselineIfTampered(t, visualDiff, baselineBefore);
    if (tamperNote) {
      result = { ...result, reason: `${result.reason} ${tamperNote}` };
    }
  }

  // eslint-disable-next-line no-console
  console.log(`${t} Verdict: ${result.verdict} (${result.source}) — ${result.reason}`);
  await annotateAiDiagnosisInAllure({
    verdict: result.verdict,
    reason: result.reason,
    source: result.source,
  });
  return result;
}

/**
 * Diagnose a failed browserless API contract test (`playwright/tests/api/`).
 *
 * There's no page, screenshot, or ARIA snapshot at failure time, so this
 * follows a different two-stage process than UI diagnosis:
 *
 * 1. Repeat the exact failing test once, in isolation, to separate a
 *    reproducible failure from a transient blip — resolved with zero LLM
 *    cost if it turns out to be flaky.
 * 2. If reproducible, a Cursor SDK agent cross-references the endpoint
 *    against the UI page object(s)/component(s) that consume it, opens a
 *    FRESH playwright-cli session against the live cluster (there's no
 *    existing test browser to attach to), and checks whether the failure has
 *    real, user-visible ramifications in that UI module before classifying.
 */
export async function diagnoseApiAssertion(
  errorMsg: string,
  testId: string,
  testTitle: string,
  specFile: string,
  projectName: string,
  jiraIds: string[],
): Promise<DiagnoseResult> {
  const t = tag(testId.slice(0, 8));

  // eslint-disable-next-line no-console
  console.log(`${t} ${testTitle} — API assertion failure`);

  const retry = await retryFailingTest(specFile, testTitle, projectName, t);

  let result: DiagnoseResult;
  if (!retry.reproducible) {
    result = {
      verdict: 'skip',
      reason:
        'Confirmed flaky: the test failed on the original run but passed when repeated in isolation immediately after (SKIP_GLOBAL_SETUP=true, --workers=1, --retries=0). Likely a transient network/auth blip rather than a real regression.',
      source: 'heuristic',
    };
  } else {
    const agentResult = await spawnApiAgent(
      testTitle,
      specFile,
      errorMsg,
      jiraIds,
      retry.output,
      testId,
      t,
    );

    if (agentResult) {
      result = agentResult;
    } else {
      // eslint-disable-next-line no-console
      console.log(`${t} Falling back to heuristic classification`);
      result = classifyByError(errorMsg) ?? {
        verdict: 'fail',
        reason: `Reproducible API failure (confirmed on isolated retry), no agent available for UI cross-check: ${errorMsg.slice(
          0,
          300,
        )}`,
        source: 'heuristic',
      };
    }
  }

  // eslint-disable-next-line no-console
  console.log(`${t} Verdict: ${result.verdict} (${result.source}) — ${result.reason}`);
  await annotateAiDiagnosisInAllure({
    verdict: result.verdict,
    reason: result.reason,
    source: result.source,
  });
  return result;
}

export function cleanupDiagnoseFiles(): void {
  try {
    if (!fs.existsSync(DIAGNOSE_DIR)) return;
    const files = fs.readdirSync(DIAGNOSE_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(DIAGNOSE_DIR, file));
    }
  } catch {
    /* best-effort cleanup */
  }
}
