# Retrospective Workflow — Closing an Epic

Use when closing a multi-week multi-bead epic (e.g., plateau-90, tree-lenses, era2). The session that closes the LAST critical-path sub-bead, OR the epic itself, owns the retrospective.

**Trigger**: `km bd close <epic-id>` on an epic with ≥3 closed sub-beads, or closing the last open sub-bead under such an epic.

**Don't fire on**: single-session work, ad-hoc explorations, epics with <3 sub-beads (a per-bead /complete is enough).

## Why this exists

`/complete` audits a session. This audits a *program*. Programs span weeks across many sessions; their post-ship narrative scatters across bead NOTES, /tmp logs, conversation transcripts that age out. Without a retro, cross-program lessons get re-discovered the next time. The plateau-90 program (April 2026) made this visible — `hub/silvery/design/plateau-90-retro.md` is the reference output.

## The Iron Rule

**The retro doc lives at `hub/<scope>/design/<program>-retro.md`. The epic's `--notes` points to it. No scattered narrative.**

## Step 1: Verify the program is actually closing

```bash
km bd show <epic-id>
km bd list --parent <epic-id>
km bd list --parent <epic-id> --status open
```

If sub-beads remain open: **stop.** Either close them or explicitly defer with reason in epic NOTES. Don't write a retro for a half-shipped program — it ages worse than no retro.

### Step 1b: Retroactively fix mis-parented beads

If `km bd list --parent <epic-id>` shows fewer children than the design/retro doc references, the program's beads were mis-parented (parented to slice-level epics or scope backlogs instead of the program epic). Fix this before continuing.

```bash
# 1. Extract bead IDs from the program's design/retro doc
grep -oE 'km-[a-z]+\.[a-z0-9-]+' hub/<scope>/design/<program>-retro.md | sort -u

# 2. For each, check current parent
for id in <bead-ids>; do
  km bd show "$id" 2>&1 | grep -A1 PARENT
done

# 3. Re-parent the ones that semantically belong to the program
#    Slice epics (@km/silvery/structural-hardening) → parent to program epic
#    Scope-backlog beads (km-silvery.<follow-up>) → parent if part of the program, else leave
#    External-blocked beads (@km/all/upstream-waiting children) → leave under upstream-waiting
km bd update <slice-epic> --parent <program-epic>
```

**Don't bulk-rewrite.** Each re-parent is a reporting-hierarchy change. Manual confirmation per bead. Slice epics that are 100% the program → re-parent. Slice epics that contain non-program work too → leave parented to their natural home, accept that the program retro is the canonical aggregator.

**This is the work the original /pm skill missed.** Use path-form scoped ids (`@km/<scope>/<slug>`) at creation time so the bead lands in the right namespace without a separate parent-repair step. Future fix: see @km/all/bead-parent-discipline (file if not yet created).

## Step 2: Locate the program's evidence

```bash
git log --oneline --since=<start> --until=<end> -- <scope-paths>
km bd list --parent <epic-id> --status done
bun recall --raw "<program-keyword>" -n 30
```

Pick load-bearing evidence: bead descriptions, /complete reports, integration round summaries, /pro reviews if any. Don't read everything.

## Step 3: Write the retro doc

Path: `hub/<scope>/design/<program>-retro.md`. Required sections (use plateau-90-retro.md as the reference):

```markdown
# <Program> — Post-Ship Retrospective

**Status**: shipped <date>
**Epic**: km bd show <epic-id>
**Window**: <start> → <end>

## TL;DR
3-5 sentences: what shipped, why it mattered, what was deferred.

## Net code change
| Metric | Value |
| Lines added/removed | n / n |
| Files touched | n |
| Packages affected | list |
| Tests added | n |
| New beads filed | n |

## What shipped (per sub-bead)
| Bead | Title | Status | Level/Rubric | Acceptance verified |

## Integration timeline
| Round | Date | SHA | Bumps | Notes |

## Bugs caught pre-ship
What gates caught what — surface what would have shipped broken.

## What was deferred (and why)
Explicit, not implicit.

## Lessons (meta — not just per-bead)
Each lesson proposes a concrete change (skill update, hook, settings, bead).

## Cross-references
- Epic, design docs, new skills/processes, follow-up beads.
```

Keep it tight (~140 lines for plateau-90). Tables matter — they force you to actually answer what shipped, what didn't, what was learned.

## Step 4: Promote meta-lessons (mandatory, not optional)

For each lesson broader than the program, propagate it. A lesson that lives only in the retro is a lesson lost.

| Lesson type | Where it goes |
|---|---|
| Process gap (e.g., commit-AND-push) | Update `/max`, `/complete`, or `/refactor` |
| New protocol (e.g., a verification gate) | New skill in `.claude/skills/<name>/` |
| Tooling gap (e.g., authorization model) | File a bead with the design |
| Memory-worthy heuristic | Add to `MEMORY.md` index + `feedback-*.md` file |

## Step 5: Link the retro from the epic

```bash
km bd update <epic-id> --notes "Phase shipped <date>. Retro: hub/<scope>/design/<program>-retro.md (commit <sha>). Process changes: <list>. Follow-up beads: <list>."
```

This is the durable pointer. Future sessions running `km bd show <epic-id>` see it.

## Step 6: Close the epic OR mark complete

```bash
km bd close <epic-id> --reason "Phase 1 shipped <date>. Retro: <path>."
```

Or, if the epic spans multiple phases, leave it open with notes updated and file a new bead for Phase 2.

## Step 7: Commit + push

```bash
git add hub/<scope>/design/<program>-retro.md .claude/skills/  # if new skills/workflows promoted
git add @km/                                                    # bead state (closes, notes) rides the same commit
git commit -m "docs(<program>): post-ship retrospective + promoted lessons"
git push origin main
```

Beads ride normal git transport now — no separate sync step.

## Common failure modes

1. **Victory lap, not a retro.** No "what didn't go well" / "what was deferred" / "what we'd do differently" → it's marketing, not a retrospective. Force the honest sections.
2. **Lessons captured but not promoted.** Step 4 is mandatory. A lesson buried in a hub doc that nobody re-reads is a lesson lost.
3. **Retro written too early.** Acceptance unverified at origin/main = wishful retro. Run `/complete` first — its Iron Rule re-runs every closed bead's acceptance grep against `origin/main` (not local worktree).
4. **Retro written too late.** A week after ship, /tmp logs are gone, recall is stale. Window: same session that closes the epic.
5. **No cross-references.** A retro that doesn't link bead IDs, design doc paths, follow-up beads is a dead end.
6. **Single-paragraph TL;DR replaces the full retro.** Tables matter. Structured sections force you to answer the hard questions.

## Reference

`hub/silvery/design/plateau-90-retro.md` (committed 2026-04-27 at SHA `0d5104fc8`) — first full instance. Use as template.
