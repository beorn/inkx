---
description: Project management - backlog grooming, task triage, issue tracking, beads management
argument-hint: [groom | status | ready | --dry-run]
allowed-tools: Task, Read, Glob, Grep, Bash, TodoWrite, AskUserQuestion
---

# Beads Review

Review and manage the beads backlog. Part of the `/review-*` family.

**Related**: `/bd` (daily operations), `/review-code`, `/review-tests`

Activated by requests about:

- Backlog grooming, triage, cleanup
- Task/issue management
- Finding work to do
- Priority management
- Stale/duplicate detection

**Mode**: $ARGUMENTS

- `groom` or `--dry-run` → Full backlog review (survey → analyze → act)
- `status` → Quick health summary
- `ready` → Show actionable work
- (empty) → Infer from context, default to `ready`

## Contents

- [Quick Modes](#quick-modes)
  - [status - Health Summary](#status---health-summary)
  - [ready - Actionable Work](#ready---actionable-work)
- [Full Groom Mode](#full-groom-mode)
  - [Phase 1: Survey](#phase-1-survey)
  - [Phase 2: Analyze & Categorize](#phase-2-analyze--categorize)
  - [Phase 3: Present Plan](#phase-3-present-plan)

---

## Quick Modes

### `status` - Health Summary

```bash
bd count --by-status                     # Quick overview
bd count --by-priority --status open     # Priority distribution
bd list --status open --limit 0 --tree   # Hierarchical tree view
bd list --status in_progress --limit 0 --long
bd stale --days 14 --limit 0
```

Output a comprehensive table of all open beads with these columns (up to 100 beads):

| ID                    | Type    | Title                    | Priority | Claimed |
| --------------------- | ------- | ------------------------ | -------- | ------- |
| km-silvery               | epic    | silvery & ansi issues     | P1       | -       |
| km-silvery.stale-pixels  | bug     | Stale pixel bugs         | P1       | claude  |
| km-silvery.bg-bleed      | bug     | Background color bleed   | P2       | -       |
| km-tui                | epic    | TUI app issues           | P2       | -       |
| km-tui.emptybody      | bug     | Empty body column        | P2       | -       |

**Grouping rules:**

- Group epics with their children (hierarchical IDs like km-test-4, km-test-4.1, km-test-4.2)
- Show epic first, then all its subtasks indented or immediately following
- Sort groups by priority (highest first), then by ID within each group
- Limit total output to ~100 beads for readability

Then output summary counts:

| Metric           | Count |
| ---------------- | ----- |
| Open issues      | N     |
| In progress      | N     |
| Stale (14+ days) | N     |
| P0               | N     |
| P1               | N     |
| P2               | N     |
| P3               | N     |
| P4               | N     |

Flag any concerns (e.g., too many P1s, stale in_progress items).

### `ready` - Actionable Work

```bash
bd ready --limit 15
```

Output the ready list. That's it - quick and focused.

---

## Full Groom Mode

For `groom` or `--dry-run`: Systematically review through 3 phases: survey → analyze → act.

### Phase 1: Survey

Run these bash commands **in parallel** (single message, multiple Bash tool calls):

| Command                                         | Purpose                           |
| ----------------------------------------------- | --------------------------------- |
| `bd list --status open --limit 0 --tree`        | Full backlog, hierarchical view   |
| `bd list --status in_progress --limit 0 --long` | Work claimed but possibly stalled |
| `bd stale --days 14 --limit 0`                  | Issues needing attention          |
| `bd find-duplicates --status open`              | Semantic duplicate detection      |
| `bd epic status`                                | Epic completion status            |
| `bd blocked`                                    | Blocked issues and blockers       |
| `bd ready --limit 20`                           | Currently actionable work         |
| `bd count --by-status`                          | Quick status distribution         |
| `bd count --by-priority --status open`          | Priority distribution             |

Then run:

```bash
bd list --status closed --limit 20 --sort updated  # Recent completions for context
```

#### Tribe Status Sync

Before analyzing, get ground truth from tribe so you don't propose closing actively-worked beads:

1. **List sessions**: `mcp__tribe__tribe_sessions()` — who's alive
2. **Ask for status**:

```
mcp__tribe__tribe_broadcast(type="notify",
  message="Backlog grooming starting. Quick status check — what beads are you actively working on right now? Just bead IDs + one-line status.")
```

3. **Wait ~2 min** for responses, then incorporate into Phase 2 analysis. Don't block on this — if no responses, proceed with the data you have (the full plan gets tribe review in Phase 3½ anyway).

### Phase 2: Analyze & Categorize

Review survey data. For each open issue, assign to exactly one category:

#### A. Close (no longer relevant)

| Signal                    | Example                                                    |
| ------------------------- | ---------------------------------------------------------- |
| **Superseded**            | km-old describes same work as km-new which has more detail |
| **Done differently**      | Feature shipped via a different implementation path        |
| **Vague orphan**          | No description, no activity, unclear purpose               |
| **Abandoned in_progress** | Claimed 30+ days ago, no commits, assignee moved on        |
| **Requirements drifted**  | Feature/task >1 week old, codebase has changed, original requirements no longer apply |

**P4 items are long-term roadmap** — do NOT close P4 beads just because they're stale. P4 is explicitly aspirational and can stay open for 2-3 years. Only close P4 if the feature was implemented differently or is genuinely no longer relevant. You may *suggest* closing specific P4s with evidence, but staleness alone is never sufficient reason.

**Requirement**: Every close needs specific evidence.

#### A½. Verify (still relevant but stale)

Features and tasks **older than 1 week** need requirements re-verification before work begins. Bugs are usually still valid (just verify repro). If verified:

```bash
bd update <id> --notes "Verified YYYY-MM-DD: requirements still current. <any context>"
```

This resets the staleness clock for ~1-2 weeks. During grooming, check the `notes` field — if the last verification is >2 weeks old, re-verify.

#### B. Merge (duplicates)

| Signal            | Action                                  |
| ----------------- | --------------------------------------- |
| Exact duplicate   | `bd duplicates` found it                |
| Same root cause   | 3 bugs fixed by one refactor → keep one |
| Overlapping scope | One subsumes another                    |

**Keep the canonical**: More context, more discussion, clearer scope.

#### C. Reprioritize

| Change            | When                                              |
| ----------------- | ------------------------------------------------- |
| Promote P3→P1     | Blocks high-priority work, or user pain increased |
| Demote P1→P3      | Nice-to-have, workaround exists, scope creep      |
| Fix P0/P1 pile-up | >5 items at P0-P1 means priority inflation        |

**Priority criteria** (higher wins):

1. User-facing bug > internal cleanup
2. Blocking others > standalone
3. Reproducible > intermittent
4. Clear fix > needs investigation

#### D. Restructure

| Issue              | Fix                                   |
| ------------------ | ------------------------------------- |
| Missing dependency | A must complete before B, but no link |
| Orphaned subtask   | Related work should be under an epic  |
| Wrong parent       | Issue miscategorized                  |
| Scattered beads    | Related beads across mixed prefixes need consolidation |
| Random/opaque ID   | Bead has auto-generated ID (e.g., `km-3edn9`) instead of scoped name |

**Consolidation pattern** (for scattered beads sharing a theme):

1. **Identify clusters**: Search for beads by keyword across IDs, titles, descriptions
2. **Create tracking epic**: `km-<scope>` with `--type epic` and a clean scope description title (e.g., "silvery & ansi issues"). Use `bd epic status` to check epic health.
3. **Rename sub-beads**: Use `bd rename <old-id> <new-id>` to move beads to `km-<scope>.<suffix>` dot notation, then `bd update <new-id> --parent km-<scope>`
4. **Categorize carefully**: A bead mentioning X isn't always *about* X — check if it's the primary subject
5. **Verify**: `bd children <epic-id>` to confirm structure

**Bead re-ID pattern** (for beads with random/opaque IDs):

Every bead should have a human-readable scoped ID (`km-<scope>.<topic>`). During grooming, identify beads with auto-generated 5-char hex IDs and rename them:

1. **Find random IDs**: `bd list --status open | grep -E 'km-[a-z0-9]{5} '`
2. **Determine scope**: Which epic does this bead belong to? (silvery, tui, infra, etc.)
3. **Choose a descriptive suffix**: Short, lowercase, hyphenated (e.g., `scrollback-v2`, `embed-click-jump`)
4. **Use grouping prefixes** so related beads sort together alphabetically:
   - `examples-*` for demo/example beads (examples-flagship, examples-dashboard)
   - `dist-*` for distribution/packaging (dist-bundling, dist-wasm)
   - `ai-*` for AI-related features (ai-chat, ai-demo, ai-apis)
   - `tea.*` for TEA sub-beads (tea.migration, tea.standalone)
   - `ink-*` for Ink migration (ink-codemod, ink-migration)
5. **Rename**: `bd rename km-<random> km-<scope>.<suffix>` — this updates all internal references (deps, descriptions, events)
6. **Search codebase**: `Grep pattern="km-<random>" glob="*.{ts,md,json}"` — update any references in code, docs, or config
7. **Parent**: `bd update km-<scope>.<suffix> --parent km-<scope>`

#### E. Organization Review (scope health)

Review the overall km-* scope structure for maximum organization:

**1. Scope size audit** — count open children per epic:
```bash
bd epic status  # Shows completion % and child counts
```

| Finding | Action |
|---|---|
| Epic has >40 open children | Split into sub-epics by theme (e.g., km-silvery → km-silvery.demos, km-silvery.infra) |
| Epic has 0 open children (all closed) | Close the epic if it's a project epic. Scope epics stay open. |
| Beads without a parent epic | Assign to the correct scope epic |
| Catch-all scopes (km-all) with unrelated children | Dissolve — move children to specific scopes |

**2. Orphan detection** — beads not under any epic:
```bash
bd list --status open --limit 0 | grep -v "│\|├\|└"  # Top-level beads without tree indentation
```
Every non-epic bead should have a parent. Assign orphans to the correct scope.

**3. Opaque ID cleanup** — find auto-generated IDs:
```bash
bd list --status open --limit 0 2>&1 | grep -oP 'km-[a-z0-9]{5}\b' | sort -u
```
Rename any that aren't legitimate scope names (km-board, km-tribe etc. are fine).

**4. Priority alignment** — children shouldn't outrank their parent:
- If an epic is P2 but has P1 children that aren't started, demote children to match
- Exception: specific blocking bugs can be P1 under a P2 epic

**5. Cross-scope consistency** — check for beads in the wrong scope:
- Beads mentioning "termless" under km-silvery → should be km-termless
- Beads mentioning "test" infrastructure → km-vitestx or km-termless, not km-tui
- Board-specific beads under km-all → should be km-tui
- Marketing beads under km-silvery → should be km-market

**6. Sub-epic grouping** — when 5+ beads in a scope share a prefix or theme:
- Group under a sub-epic: `bd create --id km-scope.theme --type epic`
- Example: 9 `examples-*` beads → parent under `km-silvery.demos`

Run this review as part of every groom. Output findings in the Phase 3 report under a "### F. Organization" section.

#### F. Clarify (ask user)

- Description too vague to act on
- Acceptance criteria unclear
- Might be duplicate but need confirmation
- Scope seems wrong

### Phase 2½: Verify Close Candidates

**Before presenting any close recommendations**, verify each one against the codebase and related beads. This prevents closing beads that still have open work.

For each close candidate:

1. **Check children**: `bd children <id>` — are all children closed? Open children = not done.
2. **Check related beads**: `bd show <id>` — read description for mentioned sub-beads, then `bd show <sub-bead> --short` to verify their status.
3. **Check code**: For implementation beads, verify the code actually exists (grep for key types/functions mentioned in the description).
4. **Check notes**: Look for "Next:" or "TODO:" items that indicate remaining work.
5. **Check in_progress beads**: For beads claimed by `claude:*` agents, the agent session is likely dead. Check if work was committed (`git log --oneline -5 --grep="<bead-id>"`) or if the bead has notes documenting completion.

**Run verifications in parallel** — launch one agent per close candidate, or batch `bd show --short` commands.

**Upgrade or downgrade** based on findings:
- Children all closed + code exists + review done → **safe to close**
- Open children or missing code → **not safe** — move to Restructure or keep open
- Superseded but child beads still open → **close parent, also close children** with reason

This step is critical — it catches beads that *look* done from the description but have dangling open work.

6. **Track deferred items**: When a bead has "deferred", "tracked only", "P2 items", or "P1s deferred" items in its description/notes, these MUST be tracked before closing:
   - For each deferred item, find the covering bead (the one that should eventually address it).
   - If a covering bead exists: `bd update <covering-bead> --append-notes "Deferred from <closing-bead>: <item description>"` — so the item is explicitly mentioned and won't be forgotten.
   - If NO covering bead exists: create one with `bd create --id <scope>.<suffix> --type <type> --priority <N> --title "<title>" --description "Deferred <priority> from <closing-bead> (<date>). <details>"`, then parent it.
   - **Never close a bead with deferred items that have no tracking destination.** This is how work gets lost across sessions.

### Phase 3: Present Plan

Output structured report:

```markdown
## Backlog Health: YYYY-MM-DD

| Metric           | Count |
| ---------------- | ----- |
| Open issues      | N     |
| In progress      | N     |
| Stale (14+ days) | N     |
| P0               | N     |
| P1               | N     |
| P2               | N     |
| P3               | N     |
| P4               | N     |

---

### A. Close (N issues)

| ID      | Title              | Reason                             |
| ------- | ------------------ | ---------------------------------- |
| km-xxxx | Actual issue title | Superseded by km-yyyy: Other title |

### B. Merge (N pairs)

| Close            | Into             | Reason          |
| ---------------- | ---------------- | --------------- |
| km-aaaa: Title A | km-bbbb: Title B | Same root cause |

### C. Reprioritize (N issues)

| ID      | Title       | From | To  | Reason                      |
| ------- | ----------- | ---- | --- | --------------------------- |
| km-xxxx | Issue title | P3   | P1  | Blocks km-yyyy: Other title |

### D. Restructure (N changes)

| ID      | Title       | Change             | Reason                   |
| ------- | ----------- | ------------------ | ------------------------ |
| km-xxxx | Issue title | Add parent km-epic | Related to epic theme    |
| km-yyyy | Other title | Depends on km-zzzz | Must complete zzzz first |

### E. Organization (N changes)

| Scope | Issue | Action |
|---|---|---|
| km-silvery | 65 open children | Split: examples → km-silvery.demos, infra → sub-epic |
| km-all | Catch-all with unrelated children | Dissolve: move to km-tui, km-infra, km-market |
| km-foo.bar | Orphan — no parent | Assign to km-foo |

### F. Clarify (N issues)

| ID      | Title       | Question for user                          |
| ------- | ----------- | ------------------------------------------ |
| km-xxxx | Issue title | What exactly should change? Scope unclear. |

---

## Ready to Work (from `bd ready`)

[Output of bd ready --limit 10]
```

**Stop here if `--dry-run`**. Otherwise, proceed to Phase 3½.

### Phase 3½: Tribe Review (MANDATORY)

**Never execute grooming changes without tribe feedback.** Tribe members have ground truth about what's actively worked on, what's blocked, and what's about to change.

1. **Check who's online**: `mcp__tribe__tribe_sessions()` — know who can respond
2. **Broadcast the full plan**: Send the entire Phase 3 report to tribe, asking for:

```
mcp__tribe__tribe_broadcast(type="notify",
  message="Backlog grooming — proposed changes below. Please reply with:
  1. Objections to any close/merge/reprioritize/restructure
  2. Status update for ALL beads you know about (in_progress, claimed, or related to your work)
  3. Beads you claimed but are no longer working on
  4. Bugs/issues found but not yet tracked
  Will execute in ~5 min if no objections.

  [paste proposed changes summary here]")
```

3. **Wait for responses** — tribe members typically respond within 1-2 minutes. Wait for at least 2 responses or 5 minutes, whichever comes first.
4. **Incorporate feedback**: Adjust the plan based on objections. Common adjustments:
   - Member says a bead is actively worked → keep in_progress
   - Member objects to merge → keep separate
   - Member reports untracked work → create new beads
   - Member confirms bead is done → safe to close
5. **If a member doesn't respond**, flag their in_progress beads as "Clarify" with note "No tribe response during groom — verify next session."

### Phase 4: Execute

After tribe review (and user confirmation if needed), execute changes in this order:

1. **Closes and merges first** (reduces noise)
2. **Restructure** (dependencies, parents)
3. **Reprioritize** (now that structure is clean)

### Commands

```bash
# Close with reason
bd close <id> --reason "Grooming: <reason>"

# Mark as duplicate (auto-closes source)
bd duplicate <source-id> --of <canonical-id>

# Update priority
bd update <id> --priority <N>

# Add dependency (issue depends-on blocker)
bd dep add <issue-id> <depends-on-id>

# Set parent (for epic membership)
bd update <id> --parent <epic-id>

# Remove from wrong parent
bd update <id> --parent ""
```

### Verify

After execution:

```bash
bd list --status open --limit 0 | wc -l   # Should decrease
bd stale --days 14 --limit 0 | wc -l      # Should decrease
bd ready --limit 10                        # Should look actionable
```

### Update References

When closing, merging, or restructuring beads, **search for and update references**:

```bash
# Find all references to affected bead IDs across the entire codebase
grep -r "km-closed-id" .
```

Never leave dangling references.

---

## Quality Gates

Before presenting plan, self-check:

- [ ] Every "close" has evidence (not just "seems stale")
- [ ] Every "merge" specifies which survives and why
- [ ] Priority changes use the criteria above
- [ ] No circular dependencies introduced
- [ ] References to closed/merged beads updated
- [ ] Clarify items have specific questions

## Anti-Patterns

- Creating new issues during grooming (that's planning, not grooming)
- Closing issues without evidence
- Bulk priority changes without cascade analysis
- Adding deps for org-chart aesthetics
- Spending time on P4 items when P1s exist

## Retrospective: Backlog Health Patterns

After completing backlog grooming, analyze patterns to improve issue tracking practices.

### 1. Pattern Recognition

Review grooming findings to identify systemic issues:

**Key questions:**

- Which category had most issues? (Close, merge, reprioritize, restructure, clarify)
- Were problems due to process (e.g., no cleanup cadence) or tooling (e.g., duplicate detection)?
- Did stale issues cluster around specific themes or work areas?
- Were duplicate issues created by same person/process repeatedly?

### 2. Root Cause Analysis

For each major pattern, identify why it occurred:

| Pattern Example          | Root Cause Hypothesis         | Evidence/Context                            |
| ------------------------ | ----------------------------- | ------------------------------------------- |
| Many stale P4 issues     | No periodic P4 cleanup        | 50+ P4 issues untouched for 60+ days        |
| Duplicate issues         | No pre-search habit           | Same person created 3 similar issues        |
| Priority inflation       | No priority guidelines        | 15 P1 issues but only 3 are truly blocking  |
| Vague issue descriptions | Templates not enforced        | Many issues lack acceptance criteria        |
| Orphaned subtasks        | Epic planning incomplete      | Tasks created without parent epic           |
| Circular dependencies    | No validation on dep creation | Issue A depends on B depends on A           |
| Abandoned in_progress    | No claiming time limits       | Issues claimed 30+ days ago with no commits |
| Missing dependencies     | No planning review step       | Work blocked but blocker not linked         |

### 3. Process Improvements

Propose concrete improvements based on root causes:

**Workflow improvements:**

- Add monthly P4 cleanup cadence (auto-close or promote)
- Require search before creating new issue (pre-creation checklist)
- Add priority decision tree to documentation
- Create issue templates with required fields
- Add epic planning step before task creation
- Validate dependencies on creation (detect cycles)
- Add claiming time limits (auto-release after 14 days of inactivity)

**Tooling enhancements:**

- Add `bd duplicates` to pre-commit hook for author awareness
- Create `bd validate` command to check for circular deps, orphans, etc.
- Add priority health check (warn if >5 P0-P1 issues)
- Auto-tag stale issues (flag after 30 days)
- Add `bd search <query>` before `bd create` workflow
- Generate backlog health dashboard (metrics over time)

**Documentation:**

- Document priority criteria with examples
- Create issue templates for each type (bug, task, epic, feature)
- Add "When to Create an Epic" guide
- Document dependency best practices
- Create grooming checklist for regular cadence

**Team practices:**

- Schedule regular grooming sessions (e.g., weekly)
- Assign backlog health owner (rotating responsibility)
- Set WIP limits for in_progress status
- Review closed issues in retros (learning from what worked)

### 4. Self-Assessment

Evaluate grooming effectiveness:

| Dimension       | Assessment                                         |
| --------------- | -------------------------------------------------- |
| Coverage        | Did we review all statuses and priorities?         |
| Decisiveness    | Did we make clear decisions or defer too much?     |
| Evidence        | Were closures backed by evidence, not assumptions? |
| Impact          | Did grooming make the backlog more actionable?     |
| Sustainability  | Did we address root causes or just symptoms?       |
| Tool efficiency | Did tools help or was everything manual?           |
| Time spent      | Was grooming time proportional to backlog size?    |

### 5. Metrics Tracking

Compare before/after to measure improvement:

| Metric                   | Before | After | Target |
| ------------------------ | ------ | ----- | ------ |
| Open issues              | X      | Y     | -      |
| Stale issues (14+ days)  | X      | Y     | <10%   |
| In progress              | X      | Y     | <10    |
| P0-P1 issues             | X      | Y     | <8     |
| Issues without desc      | X      | Y     | 0      |
| Orphaned subtasks        | X      | Y     | 0      |
| Circular dependencies    | X      | Y     | 0      |
| Duplicate issues         | X      | Y     | 0      |
| Issues closed            | -      | Y     | -      |
| Issues merged            | -      | Y     | -      |
| Avg time to first action | X days | Y     | <3d    |

### 6. Create Process Improvement Beads (Optional)

For significant process gaps identified:

```bash
DATE_SUFFIX=$(date +%m%d)

# Example: Workflow improvement
bd create --id "km-proc-groom-cadence-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Establish monthly grooming cadence" \
  --body="Review found 50+ stale P4 issues. Add recurring grooming schedule."

# Example: Tooling gap
bd create --id "km-proc-bd-validate-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Add bd validate command for health checks" \
  --body="Auto-detect circular deps, orphans, priority inflation, etc."

# Example: Documentation gap
bd create --id "km-proc-priority-guide-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Document priority decision criteria" \
  --body="Create flowchart: user-facing bug > blocking > standalone > nice-to-have"

# Example: Template improvement
bd create --id "km-proc-issue-templates-$DATE_SUFFIX" --type=task --priority=3 \
  --title="Create issue templates for bd" \
  --body="Templates for bug, task, epic, feature with required fields"
```

### 7. Update Backlog Review Workflow

If the grooming revealed gaps in this review process itself, consider updating [review-beads.md](review-beads.md):

**New analysis checks:**

- Example: "Check for issues with no activity in 90+ days (not just 14+)"
- Example: "Detect issues that changed priority 3+ times (priority thrashing)"
- Example: "Find epics with no children (orphaned epics) — use `bd epic status` to check"

**Severity criteria refinements:**

- Example: "Abandoned in_progress for 60+ days is higher severity than 30+ days"
- Example: "Circular deps involving P0 issues are Critical vs Medium for P3"

**Workflow improvements:**

- Example: "Run `bd ready` before and after grooming to show impact"
- Example: "Add 'health score' calculation based on multiple metrics"
- Example: "Generate trend chart showing backlog health over time"

Make edits directly to this file or create a process improvement bead.

**This creates a continuous feedback loop for backlog health and issue tracking practices.**

**Keywords**: review-beads, pm, groom, backlog, triage, cleanup, organize, stale, duplicates, priorities, hygiene, beads, issues, tasks, work, ready, sprint
