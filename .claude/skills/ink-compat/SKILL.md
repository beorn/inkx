---
description: Silvery vs Ink comparison, compat upgrade, benchmarking, and positioning analysis. One skill for all Ink-related work. Use when Ink releases a new version, when updating silvery-vs-ink docs, when benchmarking, or when planning silvery's positioning.
argument-hint: [mode] — bench | upgrade | analyze | position | all (default: all)
---

# Ink Compatibility, Benchmarking & Positioning

**Mode**: $ARGUMENTS (default: `all`)

Silvery's relationship with Ink needs constant maintenance: compat testing, benchmarks, positioning docs, feature parity analysis. This skill runs all of it in one workflow.

## Modes

| Mode | What it does | When to use |
|---|---|---|
| `bench` | Run silvery-vs-ink bench, save results, compare baseline | Before/after silvery perf changes |
| `upgrade` | Bump Ink version, run compat tests, fix shims, update RESULTS.md | When Ink releases a new version |
| `analyze` | Deep-dive on new Ink features, compare with silvery, propose response | When unsure how to respond to Ink changes |
| `position` | Update positioning docs, feature parity tables, moat analysis | After significant changes (ours or theirs) |
| `all` | Full workflow — all of the above in order | Quarterly / before major silvery releases |

## Mode: bench

### Goal
Produce current silvery-vs-ink numbers, compare with prior baseline, detect regressions.

### Process

1. **Pre-flight**
   - Check CPU load: `top -l 1 -n 5 -stats command,cpu | head -10`
   - Kill competing processes if system is loaded
   - Ensure quiet machine for meaningful numbers

2. **Run the bench**
   ```bash
   SILVERY_STRICT=0 bun vitest bench hub/silvery/benchmarks/silvery-vs-ink.bench.ts 2>&1 | tee /tmp/bench-silvery-vs-ink-$(date +%Y%m%d).txt
   ```

3. **Compare with baseline**
   - Read `hub/silvery/benchmarks/history.jsonl` (if exists)
   - Compare current run to last entry
   - Flag regressions >10%
   - Flag improvements >10%

4. **Update results**
   - Append new entry to `hub/silvery/benchmarks/history.jsonl`
   - Update `hub/silvery/internals/perf-analysis-YYYY-MM.md` with latest numbers

5. **Report**
   - Summary table: Silvery vs Ink per scenario
   - Deltas from last run
   - Absolute ms gaps (not just ratios)
   - Flag anything >10% regression for investigation

### Key reference
- Bench file: `hub/silvery/benchmarks/silvery-vs-ink.bench.ts`
- Perf bead tree: `km-silvery.perf` (children track specific optimizations)
- Existing analysis: `hub/silvery/internals/perf-analysis-2026-04.md`

---

## Mode: upgrade

### Goal
Bump Ink to latest version, run compat tests, fix any regressions, update shims for new hooks.

### Process

1. **Check current pinned version**
   ```bash
   grep -i "ink.*version\|inkVersion\|INK_VERSION" vendor/silvery/packages/ink/scripts/compat-check.ts
   cat vendor/silvery/tests/compat/ink/RESULTS.md | head -20
   ```

2. **Check latest Ink version**
   ```bash
   bunx npm view ink version
   ```

3. **Bump the pinned version**
   - Edit `vendor/silvery/packages/ink/scripts/compat-check.ts`
   - Update the version constant

4. **Run full compat suite**
   ```bash
   cd vendor/silvery && bun run compat 2>&1 | tee /tmp/ink-compat-$(date +%Y%m%d).txt
   ```

5. **Categorize failures**
   For each new failure vs prior run:
   - **Bug**: silvery compat layer bug → fix in `packages/ink/src/ink.ts` or `ink-hooks.ts`
   - **New feature**: Ink added something new → evaluate (see step 5b)
   - **Architectural**: intentional divergence → document in RESULTS.md

5b. **Evaluate new Ink features (CRITICAL — don't just shim everything)**
   For each new Ink feature, answer:
   - Is this a better design than what silvery currently has?
   - Does silvery already have an equivalent (possibly under a different name)?
   - Would adopting Ink's API improve silvery, or pollute it?

   Then classify:

   | Verdict | When | Action |
   |---|---|---|
   | **ADOPT** | Ink's design is genuinely good and silvery doesn't have it | Add to silvery proper (not just compat layer). New hook/prop in @silvery/ag-react. |
   | **SHIM** | Silvery already does it better under a different API | Map Ink's API to silvery's existing implementation in the compat layer. |
   | **IGNORE** | Cosmetic difference, no user-visible impact | Document as intentional divergence. Don't add code. |
   | **DEFER** | Feature doesn't add value for silvery's audience yet | Document, create a bead, revisit later. |

   **Principle**: While silvery is young, adopt what's genuinely better from Ink. Keep what silvery does better with a compat shim. Bad Ink designs should stay in the compat layer, not pollute silvery's core API.

   Document each evaluation in the tracking bead (km-silvery.ink70-feature-eval or equivalent for future versions).

6. **Add shims for new hooks**
   Check `/Users/beorn/Code/pim/km/node_modules/ink/build/index.d.ts` for new exports.
   For each new hook/feature:
   - If ADOPT: implement in `packages/ag-react/src/hooks/` and re-export from compat layer
   - If SHIM: add to `vendor/silvery/packages/ink/src/ink-hooks.ts`, map to silvery equivalent
   - If IGNORE/DEFER: mark as known divergence in RESULTS.md

7. **Update scorecard**
   - `vendor/silvery/tests/compat/ink/RESULTS.md` — new totals
   - `vendor/silvery/tests/compat/ink/ANALYSIS.md` — new architectural notes
   - `vendor/silvery/tests/compat/ink/AUDIT.md` — per-feature breakdown

8. **Update public docs**
   - `vendor/silvery/docs/guide/silvery-vs-ink.md` — feature parity table
   - `vendor/silvery/docs/getting-started/migrate-from-ink.md` — new hook migration

### Files
- Compat runner: `vendor/silvery/packages/ink/scripts/compat-check.ts`
- Compat shims: `vendor/silvery/packages/ink/src/ink.ts`, `packages/ink/src/ink-hooks.ts`
- Tests: `vendor/silvery/tests/compat/ink/generated/` + `helpers/ava-shim.ts`
- Scorecard: `vendor/silvery/tests/compat/ink/RESULTS.md`

### Commit message template
```
compat: upgrade Ink compat to v{X.Y.Z}

Previous: v{A.B.C} ({pass}/{total} = {%})
Current:  v{X.Y.Z} ({pass}/{total} = {%})

New shims: {hook1}, {hook2}, ...
Fixed bugs: {count}
New intentional divergences: {count}

Refs: km-silvery.ink-compat-upgrade
```

---

## Mode: analyze

### Goal
Deep-dive on Ink's latest features, understand architectural implications, propose silvery's response.

### Process

1. **Enumerate new Ink features**
   Read Ink's public API:
   ```bash
   cat node_modules/ink/build/index.d.ts | grep -E "export.*(hook|render|use[A-Z])"
   cat node_modules/ink/build/ink.d.ts | head -80
   ```

2. **For each new feature**
   - Read the implementation: `node_modules/ink/build/hooks/use-*.js`
   - Read our equivalent (if exists): `vendor/silvery/packages/ag-react/src/hooks/`
   - Compare API shape, semantics, strengths, weaknesses

3. **Categorize**
   - **Parity needed**: silvery should add/rename to match
   - **Silvery is better**: document why, keep our name
   - **Ink is better**: plan to adopt
   - **Irrelevant**: Ink-specific concern that doesn't apply to silvery

4. **For "parity needed" items, create design docs**
   - `hub/silvery/design/v-undecided/{feature}-parity.md`
   - Include: API diff, migration path, effort estimate
   - Reference existing examples: `boxmetrics-parity.md`, `focus-parity.md`, `animation.md`

5. **Create beads**
   - Each parity gap → child bead of `km-silvery.positioning`
   - Name: `km-silvery.{feature}-parity`
   - Priority: based on migration friendliness impact

6. **Architectural analysis**
   For each new Ink feature, answer:
   - Can Ink's approach scale? (log-update line diffing can't catch silvery's cell-level)
   - Is this structural or incremental? (scroll containers would be structural for Ink)
   - Does it threaten silvery's moat? (usually no — Ink is filling gaps silvery already has)

---

## Mode: position

### Goal
Update silvery's positioning docs based on current state of both projects.

### Process

1. **Gather current state**
   - Latest bench numbers (from `bench` mode)
   - Latest compat % (from `upgrade` mode)
   - Latest feature parity table (from `analyze` mode)
   - Silvery horizons: `hub/roadmap.md` § Track 2

2. **Update positioning bead**
   - `bd show km-silvery.positioning`
   - Update numbers, feature table, elevator pitches

3. **Update silvery.dev docs**
   Only if numbers changed significantly (>10%) or a claim needs retiring:
   - `vendor/silvery/docs/guide/silvery-vs-ink.md` — main comparison
   - `vendor/silvery/docs/index.md` — homepage hero
   - `vendor/silvery/README.md` — npm page
   - `vendor/silvery/docs/getting-started/migrate-from-ink.md`

4. **Defensibility check**
   For each horizon (v1.0, v1.5, v2.0, v3.0):
   - What did Ink just add that shrinks silvery's moat?
   - What can silvery build that Ink structurally can't?
   - Update defensibility scorecard in `km-silvery.positioning` bead

5. **Strategic recommendations**
   - Which new silvery features to prioritize (based on moat strength)
   - Which Ink features to match (based on migration impact)
   - Which positioning claims to retire

### Honest narrative principles
- Lead with absolute gaps (ms), not ratios (%)
- Show where Ink wins too
- Never claim 100x without specific methodology caveat
- Use real-world scenarios (kanban, dashboard) not synthetic ones (deep trees)
- Differentiate by use case: "Ink for CLIs, silvery for apps"

---

## Mode: all

Run all modes in order, then produce a **five-axis impact report** covering every area that needs update:

### Step 1: Execute modes
1. **upgrade** — get compat current
2. **analyze** — understand what changed in Ink
3. **bench** — measure perf after updates
4. **position** — distill into strategic narrative

### Step 2: Five-axis impact report

After the modes complete, produce a structured report covering all five impact areas. Every significant Ink change must be analyzed against all five axes.

#### Axis 1: Positioning

For each Ink change, answer:
- Does this shrink silvery's moat? How much?
- Does this retire an existing silvery claim (e.g., "we have X, Ink doesn't")?
- Does it reveal a new silvery differentiator?
- What's the updated elevator pitch?

**Update targets:**
- `km-silvery.positioning` bead (append findings)
- `hub/silvery/launch/positioning-YYYY.md` (internal strategy)
- Defensibility scorecard (add/remove rows)

#### Axis 2: Docs

For each Ink change, answer:
- What public-facing claims are now outdated?
- Which comparison tables need updating?
- Which code examples in docs still work on both?
- What new migration guide entries are needed?

**Update targets:**
- `vendor/silvery/docs/guide/silvery-vs-ink.md` (main comparison)
- `vendor/silvery/docs/index.md` (homepage hero numbers)
- `vendor/silvery/README.md` (npm description)
- `vendor/silvery/docs/getting-started/migrate-from-ink.md` (migration paths)
- `vendor/silvery/docs/guide/why-silvery.md` (value prop)

**Rule**: Only update docs when numbers shift >10% or a claim becomes false. Otherwise queue in positioning bead for batch update.

#### Axis 3: Tests

For each Ink change, answer:
- Does the compat suite cover new features?
- Are there new edge cases in existing features?
- Do our generated/ tests match Ink's current test suite?
- What intentional divergences need documenting?

**Update targets:**
- `vendor/silvery/packages/ink/scripts/compat-check.ts` (AVA runner)
- `vendor/silvery/tests/compat/ink/generated/*.test.tsx` (hand-ported)
- `vendor/silvery/tests/compat/ink/helpers/ava-shim.ts` (translator)
- `vendor/silvery/tests/compat/ink/RESULTS.md` (scorecard)
- `vendor/silvery/tests/compat/ink/ANALYSIS.md` (architectural notes)
- `vendor/silvery/tests/compat/ink/AUDIT.md` (per-feature breakdown)

**Process**:
1. Run `bun run compat` against new Ink version
2. Diff pass/fail against prior RESULTS.md
3. For each new failure: categorize as bug / missing feature / intentional divergence
4. Fix bugs, add shims for features, document divergences

#### Axis 4: Compat Layer

For each new Ink hook/component/option, answer:
- Does the shim exist?
- Does it map to silvery's equivalent correctly?
- Are edge cases covered (options, autoFocus timing, etc.)?
- Does it throw on unsupported features or silently degrade?

**Update targets:**
- `vendor/silvery/packages/ink/src/ink.ts` (render + core API)
- `vendor/silvery/packages/ink/src/ink-hooks.ts` (hook shims)
- `vendor/silvery/packages/ink/src/components/` (component shims)

**Rule**: New Ink hooks without silvery equivalent should either:
- (a) Shim to silvery's equivalent
- (b) No-op with console.warn in dev
- (c) Throw a clear error pointing to silvery docs

Never silently do nothing — users need to know.

#### Axis 5: Features/Roadmap

For each Ink change, answer:
- Does this move one of silvery's roadmap horizons up in priority?
- Does it reveal a gap we should fill before v1.0?
- Does it threaten a v2.0/v3.0 differentiator?
- Should any silvery-internal design docs be updated?

**Update targets:**
- `hub/roadmap.md` § Track 2 (roadmap definitions)
- `hub/silvery/design/v05-layout/`, `v10-terminal/`, `v15-tea/`, `v20-canvas/`, `v30-graphics/`
- `hub/silvery/design/v-undecided/` (new parity designs)
- `km-silvery.*` beads (new implementation tasks)

**Decision matrix**:
| Ink added X | Silvery response |
|---|---|
| Feature silvery already has with different name | Add compat shim + migration note |
| Feature silvery has but worse | Improve silvery, keep silvery's API |
| Feature silvery lacks, easy to add | Design doc + bead, P1 |
| Feature silvery lacks, architectural | Document why we chose different path |
| Feature silvery won't add (off-roadmap) | Document intentional divergence |

### Step 3: Unified report template

```markdown
# Ink {VERSION} Impact Report — {DATE}

## Summary
- Compat: {old %} → {new %} ({delta})
- New features: {count}
- Bench regressions: {count}
- Bench wins: {count}
- Docs changes needed: {count}
- New beads created: {count}

## New Ink features
{per-feature breakdown with all 5 axes}

## Impact by axis

### 1. Positioning
{changes to moat, narrative, claims}

### 2. Docs
{pages that need updates, queued or done}

### 3. Tests
{compat delta, new fixtures needed}

### 4. Compat layer
{new shims added, bugs fixed}

### 5. Features/Roadmap
{horizon changes, new beads, priority shifts}

## Beads
- Created: {list}
- Updated: {list}
- Closed: {list}

## Next actions
{prioritized list for follow-up sessions}
```

### Step 4: File the report

Save to: `hub/silvery/launch/ink-{VERSION}-impact-{DATE}.md`

Reference from: `km-silvery.positioning` bead notes

## Expected time

- `bench` only: ~30 min
- `upgrade` only: 1-2 hours
- `analyze` only: 1-2 hours
- `position` only: 30-60 min
- `all` (quarterly): 4-6 hours

---

## Commit boundaries

Commit after each mode:
1. `compat: upgrade Ink to vX.Y.Z`
2. `design: analyze Ink vX.Y.Z features — parity analysis`
3. `bench: silvery vs ink vX.Y.Z — new baseline`
4. `docs: update silvery positioning based on Ink vX.Y.Z`

This keeps the diff reviewable and makes it easy to bisect regressions.

## Automation opportunities

Things to build into this skill over time:

1. **`bun run compat:upgrade <version>`** — semi-automated version bump
2. **Tribe scheduler** — weekly check for new Ink releases
3. **CI gate** — block silvery releases if compat drops below threshold
4. **Automated history tracking** — `benchmarks/history.jsonl` appended per bench run
5. **Diff reports** — show per-hook compat status changes between versions
6. **Ink release subscription** — fetch Ink's GitHub releases, summarize what changed

## Key files and beads

### Tracking beads
- `km-silvery.positioning` (P0 tracking epic) — strategic narrative
- `km-silvery.perf` (P1 epic) — performance optimization
- `km-silvery.ink-compat-upgrade` (P0) — upgrade process itself
- `km-silvery.boxmetrics-parity`, `km-silvery.focus-parity`, `km-silvery.animation` — feature parity work

### Bench
- `hub/silvery/benchmarks/silvery-vs-ink.bench.ts` — head-to-head
- `hub/silvery/internals/perf-analysis-2026-04.md` — latest analysis

### Compat
- `vendor/silvery/packages/ink/scripts/compat-check.ts` — AVA runner
- `vendor/silvery/packages/ink/src/ink.ts` — compat layer entry
- `vendor/silvery/packages/ink/src/ink-hooks.ts` — hook shims
- `vendor/silvery/tests/compat/ink/` — test infrastructure

### Docs
- `vendor/silvery/docs/guide/silvery-vs-ink.md` — public comparison
- `vendor/silvery/docs/getting-started/migrate-from-ink.md` — migration guide
- `hub/silvery/launch/positioning-2026.md` — internal strategy
- `hub/silvery/design/v-undecided/*-parity.md` — per-feature design docs

### Horizons
- `hub/roadmap.md` § Track 2 — v0.5 / v1.0 / v1.5 / v2.0 / v3.0 roadmap
- Each horizon expands silvery's moat beyond Ink's reach (canvas, multi-framework, a11y, AI mode)
