---
description: Quality plateau gap analysis. Auto-qualifies one or more domain lenses from this session's edits, friction, attention, claims, and bd activity; loads each lens's plateau definition; ranks gaps and offers DO / CAPTURE / DOC / SKIP. Catches plateau-gap entropy while context is still hot.
argument-hint: "[<lens-name> | narrow | wider | worktree | all | --doc | --bead | --do]"
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, Agent
---

# /plat — quality plateau gap analysis

Catches "we just shipped this section, plateau-check before moving on" while patterns are still in working memory. Without this, gaps accumulate as bugs, wrong paths, and slow-down entropy across sessions.

Run after a substantial edit pass, before `/commit`, when something feels not-done-done, or anytime you hear yourself ask *"are we at the quality plateau yet?"*

## Domain lens (the unit of analysis)

A **lens** is a coherent slice of the system with its own vocabulary and plateau criteria — typically spans multiple files and sometimes packages. Not raw paths.

```
agent-dispatch              @agent/* + claim/ + km-beads/lease.ts + hub/dev/agent-dispatch.md
km bd mutation pipeline     km-storage + repo.updateNode + sync + fs-writer
silvercode L5 chat domain   agent-host-l5/ + ChatEvent + parity-claude
silvery TEA architecture    @silvery/tea/* + commands + signals + selection-focus-plateau
```

Lenses auto-discover from `*plateau*.md` beads, `hub/<scope>/design/` directories, the CLAUDE.md "Triage" table at `/Users/beorn/Code/pim/km/CLAUDE.md`, and co-mention clusters. Scope tokens (`@km/<scope>`) are the fallback.

## Discovery (run at invocation time, don't hardcode)

The skill discovers its registry dynamically. Run these from repo root:

```bash
# Plateau definitions (one per lens, when they exist)
fd -e md --glob '*plateau*' @km/

# Hub design dirs (lens anchors)
fd -t d --glob '*' hub/ -d 2 | rg '/design$'

# Lessons docs (load alongside each lens's plateau bead)
fd -e md . docs/lessons/

# Principles (violations cited in the gap report)
echo docs/principles.md

# Active claim (signal source — current bead in flight)
km bd list --assignee me --status wip --json
```

The lens-to-plateau mapping is computed by:

1. Glob `@km/**/*plateau*.md`
2. For each, derive the lens from the path: `@km/<scope>/<...>/...plateau...md` → lens name = the closest meaningful container (`@km/silvery/architectural-plateau` → silvery.architectural-plateau lens; `@km/silvercode/agent-host-l5/04-chat-thread-projection/chat-domain-quality-plateau` → silvercode-l5.chat-domain lens)
3. Cross-reference with hub design dirs and CLAUDE.md "Triage" table (each row in the triage table is a lens; the load-first reference becomes the lens's plateau definition when no `*plateau*.md` exists)

**Always-load lessons** (every `/plat` run pulls these regardless of lens):

- `docs/lessons/quality-plateau-refactoring.md` — **canonical *"what is a quality plateau?"* reference**. Load-bearing quote: *"The plateau is about the LIVE code path… every keypress, every render, not the TOTAL codebase."* Required reading when defining a new plateau.
- `docs/lessons/no-parallel-derivation.md` — most common plateau-violation pattern
- `docs/lessons/refactoring.md` — phased-migration sibling
- `docs/principles.md` — for the principle-violation citations in the gap report

**No plateau bead for the qualified lens?** — that's gap #1. `/plat --doc` seeds a `quality-plateau-gaps.md` starter.

If glob discovery returns 0 plateau beads (fresh repo), the skill emits a one-line note: *"No plateau definitions found anywhere — generic-lint mode active across all lenses; consider seeding `@km/all/plateau` first."* This makes the registry self-bootstrapping rather than dependent on a hand-maintained list.

## Signals (session-primary, all first-class)

Read `~/.claude/projects/<project>/<session>.jsonl` and weight per file → roll up to lens:

| Signal | Weight |
|---|---|
| Session edits (Edit/Write/Bash touches) | × 1 |
| **Session friction** (linter reverts, fs-writer "safe-write conflict", failed Bash + retry, user redirects, repeated reads) | **× 3** |
| User attention (paths/scope tokens/bead IDs in user prompts) | × 2 |
| Active claim (`km bd list --assignee me --status wip`) | × 2 |
| Session bd activity (`km bd show/update/create/rename` calls) | × 1 |

Friction dominates because plateau gaps live where code fought back, not where it flowed.

`/plat worktree` widens to working-tree edits + last 6h of authored commits. `/plat <lens>` skips qualification entirely. Falls back to working-tree-only with a degraded footnote if jsonl unreadable.

## Qualification

Sort lenses by heat. All ≥ 15% qualify (multi-lens output). Single-lens report if only one passes; ask the user to narrow if 4+ pass (too diffuse). Surface cross-lens correlations when two lenses share root-cause friction — usually one fix, not two reports. Always show the heat map and rationale before proceeding — never a black box.

## Enrichment (always, even outside qualified scope)

For each qualified lens, pull its `*plateau*.md`, parent epics (`parent::` / `blocks::`), relevant `CLAUDE.md` "Boundaries / Always / Never" sections, matching `docs/lessons/*.md`, principle violations from `docs/principles.md`, recent open beads, and cross-lens links.

If no plateau bead exists for a lens → that's gap #1: define one.

## Gap report

Per lens, ranked by leverage (the gap that unblocks others ranks first). Each gap carries: priority, file:line, one-sentence problem, concrete acceptance criterion, and **edge of context** — `in-context` (mechanical fix from current loaded state) or `partial-context` (drop into `/investigate`).

## Action offer

```
[DO]      work the highest-leverage gap now
[CAPTURE] file beads for remaining gaps; acceptance criteria pre-filled
[DOC]     append to hub/<scope>/quality-plateau-gaps.md
          (for lenses without a plateau bead yet)
[SKIP]    snapshot to .km/plat-snapshots/<date>.md, don't act
```

In multi-lens runs: full offer for the primary lens, CAPTURE-only default for secondaries.

`/plat --do | --bead | --doc` skip the prompt.

## Worked example (this session)

```
Heat map by domain lens:
  agent-dispatch                    51%  ← primary
  silvery TEA architecture          11%
  km bd mutation pipeline           11%  ← cross-lens link (friction source)
  agent-tooling reference (vault)    9%
  agent-native CLI surface           6%
  silvercode L5 chat domain          5%

Qualified: agent-dispatch (single primary; bd-pipeline correlates as
friction source — surface as cross-lens link).

Gap report — agent-dispatch:

  [P0] km bd fs-writer reverts unaffiliated file edits         partial-context
       Acceptance: Write any file → `km bd update <unrelated>` → edit persists.
       File: packages/km-storage/src/watch/fs-writer.ts
       Leverage: unblocks P1-P3.

  [P1] @agent/<N>.md slot files still carry pre-redirect persona content   in-context
       Acceptance: each slot ≤ 5 lines (frontmatter optional, body =
                   H1 + materialized queue only). Blocked by P0.

  [P2] @agent.md parent epic describes the OLD slot model                  in-context
       Acceptance: lines 7-12 updated to "queue-only slots".

  [P3] .claude/skills/claim/SKILL.md § 4½ stale per slot redirect          in-context
       Acceptance: § 4½ removed; "Read the persona body" simplified.

Action offer: [DO P0] [CAPTURE P1-P3] [DOC] [SKIP]
```

## Auto-trigger (post-MVP)

SessionEnd hook, conditional on > 5 Edit/Write tool calls, last 30 min wasn't pure conversation, no `/plat` already run, at least one lens ≥ 25% heat. Until wired, manual only.

## Escalation

| Gap kind | Escalate to |
|---|---|
| Missing test for invariant | `/tdd` |
| Architectural rethink | `/big` or `/why` |
| Upstream / external bug | `/pm` upstream workflow |
| Performance | `/perf` |
| Root cause unclear | `/investigate` |
| Missing plateau definition | `/plat --doc` |

## Maintenance

Most useful when the lens registry matches how the codebase is *thought about*; update friction taxonomy and lens discovery sources as they drift.
