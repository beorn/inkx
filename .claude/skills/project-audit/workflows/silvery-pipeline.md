# Deep Review: Silvery Rendering Pipeline

Comprehensive cross-perspective review of the silvery rendering pipeline — the core algorithm that transforms React trees into terminal output. Combines 3 Claude agents (focused dimensions) + 1 GPT 5.4 Pro deep research review, then synthesizes findings.

**Cost**: ~$5-15 (GPT 5.4 Pro) + ~10 min Claude agent time. Total wall time: ~15-20 min.

## When to Use

- After significant pipeline changes (new phases, dirty-flag rewrites, diff algorithm updates)
- Before a silvery release that touches rendering
- When pipeline bugs keep recurring — systematic review to find root causes
- Periodic health check (~monthly)

## Step 1: Context Gathering

Build a single context file at `/tmp/pro-review-silvery-pipeline.md` containing all pipeline source, tests, and docs. This file is shared by the GPT review and referenced by Claude agents.

### 1A: Start with shared header

```bash
cd ~/Code/pim/km
CONTEXT="/tmp/pro-review-silvery-pipeline.md"
cp .claude/skills/pro/templates/context-header.md "$CONTEXT"
```

### 1B: Append pipeline source files

Include these files in order (the rendering pipeline's execution order):

**Core pipeline** (`vendor/silvery/packages/ag-term/src/pipeline/`):
- `types.ts` — shared types and interfaces
- `helpers.ts` — utility functions used across phases
- `cascade-predicates.ts` — dirty-flag propagation logic
- `measure-phase.ts` — text measurement
- `layout-phase.ts` — flexbox layout (delegates to flexily)
- `render-phase.ts` — content generation (text wrapping, truncation, backgrounds)
- `render-phase-adapter.ts` — adapter bridging render phase to renderer
- `collect-text.ts` — text collection from node tree
- `render-box.ts` — box element rendering (borders, padding, backgrounds)
- `render-text.ts` — text element rendering (spans, styles, wrapping)
- `render-helpers.ts` — shared render utilities
- `diff-buffers.ts` — incremental diff algorithm (old buffer vs new buffer)
- `output-phase.ts` — ANSI escape sequence generation (fullscreen + inline modes)
- `measure-stats.ts` — performance measurement
- `index.ts` — pipeline orchestration and public API

**Pipeline consumers** (`vendor/silvery/packages/ag-term/src/`):
- `renderer.ts` — renderer that drives the pipeline
- `scheduler.ts` — render scheduling (batching, microtask queue)
- `output.ts` — output stream management

```bash
echo -e "\n\n# Silvery Rendering Pipeline — Source Code\n" >> "$CONTEXT"

PIPELINE_DIR="vendor/silvery/packages/ag-term/src/pipeline"
PIPELINE_FILES=(
  types.ts helpers.ts cascade-predicates.ts
  measure-phase.ts layout-phase.ts
  render-phase.ts render-phase-adapter.ts collect-text.ts
  render-box.ts render-text.ts render-helpers.ts
  diff-buffers.ts output-phase.ts
  measure-stats.ts index.ts
)

for f in "${PIPELINE_FILES[@]}"; do
  filepath="$PIPELINE_DIR/$f"
  [ -f "$filepath" ] || continue
  lines=$(wc -l < "$filepath")
  echo -e "\n## $filepath ($lines lines)\n\`\`\`typescript" >> "$CONTEXT"
  cat "$filepath" >> "$CONTEXT"
  echo -e "\`\`\`" >> "$CONTEXT"
done

CONSUMER_DIR="vendor/silvery/packages/ag-term/src"
for f in renderer.ts scheduler.ts output.ts; do
  filepath="$CONSUMER_DIR/$f"
  [ -f "$filepath" ] || continue
  lines=$(wc -l < "$filepath")
  echo -e "\n## $filepath ($lines lines)\n\`\`\`typescript" >> "$CONTEXT"
  cat "$filepath" >> "$CONTEXT"
  echo -e "\`\`\`" >> "$CONTEXT"
done
```

### 1C: Append tests

```bash
echo -e "\n\n# Tests\n" >> "$CONTEXT"

TEST_FILES=(
  "vendor/silvery/tests/cascade-formulas.test.ts"
  "vendor/silvery/tests/diff-buffers.test.ts"
  "vendor/silvery/tests/inline-fuzz.fuzz.ts"
  "vendor/silvery/tests/output-phase-wide-char-matrix.test.ts"
  "vendor/silvery/tests/output-phase-xterm-replay.test.ts"
  "vendor/silvery/tests/viewport-height-boundary.test.ts"
  "vendor/silvery/tests/capability-matrix.test.ts"
  "vendor/silvery/tests/cross-backend-output.test.ts"
)

for f in "${TEST_FILES[@]}"; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f")
  echo -e "\n## $f ($lines lines)\n\`\`\`typescript" >> "$CONTEXT"
  cat "$f" >> "$CONTEXT"
  echo -e "\`\`\`" >> "$CONTEXT"
done
```

### 1D: Append documentation

```bash
echo -e "\n\n# Documentation\n" >> "$CONTEXT"

DOC_FILES=(
  "vendor/silvery/packages/ag-term/src/pipeline/RENDERING.md"
  "vendor/silvery/CLAUDE.md"
  "vendor/silvery/docs/guide/debugging.md"
)

for f in "${DOC_FILES[@]}"; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f")
  echo -e "\n## $f ($lines lines)\n\`\`\`markdown" >> "$CONTEXT"
  cat "$f" >> "$CONTEXT"
  echo -e "\`\`\`" >> "$CONTEXT"
done
```

### 1E: Append loggily API surface

The pipeline uses loggily for debug logging — reviewers need to understand its API.

```bash
echo -e "\n\n# Loggily (Logger) — API Surface\n" >> "$CONTEXT"

for f in vendor/loggily/src/index.ts vendor/loggily/src/core.ts vendor/loggily/CLAUDE.md; do
  [ -f "$f" ] || continue
  lines=$(wc -l < "$f")
  echo -e "\n## $f ($lines lines)\n\`\`\`typescript" >> "$CONTEXT"
  cat "$f" >> "$CONTEXT"
  echo -e "\`\`\`" >> "$CONTEXT"
done
```

### 1F: Verify context file

```bash
wc -l "$CONTEXT"
wc -c "$CONTEXT"
# Should be 3000-8000 lines, 100K-300K chars
# If >300K chars, consider splitting pipeline source and tests into separate reviews
```

### 1G: Check prior review history

```bash
grep -i "silvery\|pipeline\|rendering" .claude/skills/pro/history.jsonl 2>/dev/null || echo "No prior pipeline reviews found"
```

If prior reviews exist, append a "Prior Findings" section (see [review.md](../../pro/review.md) Section C for format).

## Step 2: Create Tracking Bead

```bash
bd list --id-prefix km-silvery.deep-review --limit 10
# Create tracking bead with next sequential number
bd create --id km-silvery.deep-review-<N> --type task \
  --title "Deep Review: Silvery Pipeline (<date>)" \
  --priority 2
bd update km-silvery.deep-review-<N> --parent km-silvery
bd update km-silvery.deep-review-<N> --claim
```

## Step 3: Launch Dual Review

Launch ALL 4 reviews in a **single message** (parallel, no dependencies). Claude agents run as Task subagents; GPT runs as a background `bun llm` process. The Claude agents read source files directly; the GPT review uses the context file from Step 1.

### 3A: Claude Agent 1 — Algorithm Clarity

```
Task(subagent_type="general-purpose", prompt="
You are reviewing the silvery rendering pipeline for ALGORITHM CLARITY.

Read these pipeline source files in vendor/silvery/packages/ag-term/src/pipeline/:
- cascade-predicates.ts (dirty-flag propagation)
- render-phase.ts (content generation)
- diff-buffers.ts (incremental diff)
- output-phase.ts (ANSI output)

For each file, evaluate:
1. Are the algorithms clearly expressed? Could a new contributor understand them?
2. Are invariants documented where non-obvious?
3. Are there edge cases that aren't handled or aren't tested?
4. Is the dirty-flag cascade correct — can any state combination cause a node to skip rendering when it shouldn't (false negative) or re-render when it needn't (false positive)?
5. Is the diff algorithm correct for all cell types (ASCII, wide chars, combining marks)?

Produce findings as: file:line-range, P0-P3 classification, description, suggested fix.
Focus on CORRECTNESS bugs (P0) and clarity issues that could cause future bugs (P1).
Do NOT report: style preferences, missing JSDoc, import ordering.
")
```

### 3B: Claude Agent 2 — Test Coverage

```
Task(subagent_type="general-purpose", prompt="
You are reviewing TEST COVERAGE for the silvery rendering pipeline.

Read ALL test files in vendor/silvery/tests/ that relate to the pipeline:
- cascade-formulas.test.ts
- diff-buffers.test.ts
- inline-fuzz.fuzz.ts
- output-phase-wide-char-matrix.test.ts
- output-phase-xterm-replay.test.ts
- viewport-height-boundary.test.ts
- capability-matrix.test.ts
- cross-backend-output.test.ts

Then read the source files they test (in vendor/silvery/packages/ag-term/src/pipeline/).

Evaluate:
1. Which pipeline functions have NO test coverage?
2. Which functions are tested but with insufficient edge cases?
3. Are the fuzz tests covering the right state space?
4. Are there property-based test opportunities (e.g., diff(render(tree)) === diff(render(tree)) for idempotency)?
5. Do tests verify both correctness AND performance characteristics where relevant?

Produce findings as: area, P0-P3, description (what's untested), suggested test.
P0 = untested code path that has had bugs before. P1 = untested code path in critical algorithm.
P2 = missing edge case tests. P3 = nice-to-have coverage.
")
```

### 3C: Claude Agent 3 — Docs, Env Vars, Loggily Integration

```
Task(subagent_type="general-purpose", prompt="
You are reviewing DOCUMENTATION, ENVIRONMENT VARIABLES, and LOGGILY INTEGRATION for the silvery rendering pipeline.

Read:
- vendor/silvery/packages/ag-term/src/pipeline/RENDERING.md
- vendor/silvery/CLAUDE.md
- vendor/silvery/docs/guide/debugging.md
- vendor/loggily/CLAUDE.md
- All pipeline source files (grep for DEBUG, SILVERY_, process.env, log, logger)

Evaluate:
1. RENDERING.md: Does it accurately describe the current pipeline? Are phase descriptions up to date? Are diagrams/examples correct?
2. Environment variables: Are all SILVERY_* env vars documented? Are any undocumented? Do their names follow a consistent pattern?
3. Loggily usage: Is logging consistent across pipeline files? Are log levels appropriate (debug vs info vs warn)? Are there places that should log but don't? Are there places that log too much for production?
4. CLAUDE.md: Does it give accurate guidance for working on the pipeline?
5. debugging.md: Does it describe current debugging workflows? Are the env var names correct?

Produce findings as: file:line-range (or doc section), P0-P3, description, suggested fix.
P0 = doc says wrong thing (will mislead developers). P1 = important missing docs.
P2 = accuracy or clarity improvement. P3 = cosmetic doc issue.
")
```

### 3D: GPT 5.4 Pro Deep Research

```bash
bun llm --deep --model gpt-5.4-pro -y --no-recover \
  --context-file /tmp/pro-review-silvery-pipeline.md \
  "Deep code review of the silvery rendering pipeline — a TUI framework's core rendering engine written in TypeScript.

Review dimensions:
1. ALGORITHM CORRECTNESS: cascade-predicates.ts dirty-flag logic, diff-buffers.ts incremental diff, output-phase.ts ANSI generation. Look for off-by-one errors, missed edge cases, incorrect state transitions.
2. TEST COVERAGE: Are critical algorithms (cascade, diff, output) thoroughly tested? What's missing?
3. DOCUMENTATION: Does RENDERING.md accurately describe the pipeline? Are env vars documented?
4. PERFORMANCE: Any unnecessary allocations, O(n^2) where O(n) suffices, or blocking patterns?

For each finding provide:
- File path and line range
- Classification: P0 (correctness bug), P1 (important quality), P2 (medium), P3 (style)
- Description of the issue
- Suggested fix

Do NOT report: style preferences, missing JSDoc, import ordering, or linter-handled issues.
Focus on findings that could cause WRONG TERMINAL OUTPUT or RENDERING CORRUPTION."
```

**Execution**: Run in background (`run_in_background=true`). The `--no-recover` flag prevents picking up stale responses from prior runs. The `-y` flag auto-confirms the cost prompt.

## Step 4: Collect Results

Claude agents return their findings inline when they complete. For GPT, find the output file:

```bash
ls -lt /tmp/llm-${CLAUDE_SESSION_ID:0:8}-*.txt | head -5
```

Read the GPT output file with `Read` (NOT the task output, which is streaming tokens). Proceed to synthesis only after all 4 are complete.

## Step 5: Synthesis

Merge findings from all 4 sources into a single unified report. This is the critical step that justifies the multi-perspective approach.

### 5A: Deduplication

Many findings will appear in multiple reviews. Merge them:

| Pattern | Action |
|---------|--------|
| Same file:line, same issue | Keep highest-confidence version, note "confirmed by N/4 reviewers" |
| Same file:line, different issues | Keep both (different perspectives on same code) |
| Same issue pattern across files | Roll up into one finding with multiple locations |
| Conflicting assessments (one says bug, another says correct) | Flag as "divergent" — investigate manually |

### 5B: Priority classification

Re-classify after dedup using the unified view:

- **P0**: Confirmed by 2+ reviewers, OR a correctness bug found by any reviewer with clear evidence
- **P1**: Important issue found by 1+ reviewer, consensus that it matters
- **P2**: Quality improvement, no correctness risk
- **P3**: Style/cosmetic, only if clearly better

### 5C: Consensus tracking

For each finding, note the source(s):

```markdown
| # | Finding | File:Line | Priority | Sources | Consensus |
|---|---------|-----------|----------|---------|-----------|
| 1 | Off-by-one in wide char diff | diff-buffers.ts:142 | P0 | GPT, Agent1 | Confirmed (2/4) |
| 2 | Missing test for empty buffer | diff-buffers.test.ts | P1 | Agent2 | Single source |
| 3 | RENDERING.md stale phase name | RENDERING.md:45 | P2 | Agent3, GPT | Confirmed (2/4) |
| 4 | Log level too verbose | render-phase.ts:80 | P3 | Agent3 | Single source |
```

**Divergent findings** (reviewers disagree) get escalated — present both perspectives to the user.

## Step 6: Triage

Follow [triage.md](../../pro/triage.md) for bead creation:

1. Create per-finding bug beads for P0/P1 items under the tracking bead
2. Update tracking bead description with the synthesis table
3. Present findings to user

### Present to User

```markdown
## Deep Review: Silvery Pipeline — N findings (X confirmed across reviewers)

### P0 — Correctness Bugs (N)
1. **<title>** (`file:line`) — <description> [Sources: GPT, Agent1]
...

### P1 — Important (N)
...

### P2 — Quality (N)
...

### P3 — Style (N)
[count only]

### Divergent Findings (N)
[Issues where reviewers disagreed — present both perspectives]

**Consensus**: N findings confirmed by 2+ sources, N single-source, N divergent.
**Beads created**: km-silvery.deep-review-N + X bug beads
```

### Ask User

```
Fix P0/P1 now? (recommended — X bugs, ~Y agents needed)
Options: fix / track / skip
```

## Step 7: Implementation (if user chooses "fix")

Use `/max` to launch parallel fix agents. Each agent:
1. Writes a failing test targeting the finding
2. Implements the fix
3. Verifies the test passes
4. Closes the bug bead

Parent agent runs `bun fix && bun run test:all` after all agents complete.

## Step 8: Record History

Append to `pro-review/history.jsonl` — see [history.md](../../pro/history.md).

## Adapting This Workflow

To create a new project-specific deep review (e.g., for km-storage or flexily):

1. Copy this file as a template
2. Replace the file lists in Step 1 with the target project's source, tests, and docs
3. Adjust the 3 Claude agent dimensions to match what matters for that project
4. Adjust the GPT prompt's review dimensions
5. Keep Steps 5-8 (synthesis, triage, implementation, history) unchanged — they're generic
