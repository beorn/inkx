---
name: plat
description: "Quality plateau gap analysis. Auto-qualifies one or more domain lenses from this session's edits, friction, attention, claims, and bd activity; loads each lens's plateau definition; ranks gaps and offers DO / CAPTURE / DOC / SKIP. Use when asking whether an area has reached its quality plateau."
argument-hint: "[<lens-name> | narrow | wider | worktree | all | --doc | --bead | --do]"
---

# $plat - Quality Plateau Gap Analysis

**Keywords**: plat, plateau, quality plateau, L5, gap analysis, not-done-done, quality plateau yet

Use this after a substantial edit pass, before `$commit`, when something feels not-done-done, or when the user asks "are we at the quality plateau yet?"

This is a Codex skill. Invoke it as `$plat ...`; `/plat ...` is equivalent only when that slash request reaches Codex as text.

## Domain Lens

A **lens** is a coherent slice of the system with its own vocabulary and plateau criteria. It is not just a path glob.

Examples:

```text
agent-dispatch              @agent/* + claim/ + km-beads/lease.ts + docs/dev/agent-dispatch.md
km bd mutation pipeline     km-storage + repo.updateNode + sync + fs-writer
silvercode L5 chat domain   agent-host-l5/ + ChatEvent + parity-claude
silvery TEA architecture    @km/silvery/tea/* + commands + signals + selection-focus-plateau
```

## Discovery

Discover the registry dynamically from repo root. Do not hardcode lenses.

```bash
# Plateau definitions
fd -e md --glob '*plateau*' @km/ 2>/dev/null || find @km -name '*plateau*.md'

# Hub design anchors, when hub work is relevant
fd -t d --glob '*' hub/ -d 2 2>/dev/null | rg '/design$' || true

# Lessons and principles
fd -e md . docs/lessons/ 2>/dev/null || find docs/lessons -name '*.md'
printf '%s\n' docs/principles.md

# Active claim / WIP beads
km bd list --assignee me --status wip --json
```

Map plateau files to lenses by path:

1. `@km/**/*plateau*.md` is the main registry.
2. Derive the lens from the closest meaningful container:
   `@km/silvery/architectural-plateau.md` -> `silvery.architectural-plateau`;
   `@km/silvercode/agent-host-l5/04-chat-thread-projection/chat-domain-quality-plateau.md` -> `silvercode-l5.chat-domain`.
3. Cross-reference `hub/*/design/`, `AGENTS.md`, and the `CLAUDE.md` triage table when a lens has no plateau bead.

If no plateau definitions exist, say:

```text
No plateau definitions found anywhere - generic-lint mode active across all lenses; consider seeding @km/all/plateau first.
```

## Required References

Always load these before judging gaps:

- `docs/lessons/quality-plateau-refactoring.md` - canonical plateau reference. Load-bearing principle: the plateau is about the live code path, not total codebase cleanup.
- `docs/lessons/no-parallel-derivation.md` - common plateau violation.
- `docs/lessons/refactoring.md` - phased migration failure modes.
- `docs/principles.md` - cite principle violations in the report.

## Signals

Prefer session-local signals, then widen only when asked.

| Signal | Weight |
|---|---:|
| Session edits and tool touches | 1 |
| Session friction: failed commands, retries, conflicts, user redirects, repeated reads | 3 |
| User attention: paths, bead ids, scope tokens in prompts | 2 |
| Active claim: `km bd list --assignee me --status wip` | 2 |
| Session bd activity: show/update/create/rename/close calls | 1 |

Codex-first sources:

- `bun recall current-brief` for current session summary, paths, beads, and tail.
- `bun recall --raw "<lens tokens>" -n 10` for recent session hits.
- `git status --short`, `git diff --stat`, and recent commits for edited files.
- `~/.codex/projects/**` only through targeted `rg`; never `cat` full JSONL.

Claude-compatible fallback:

- If the current task clearly came from Claude Code history, targeted `rg` in `~/.claude/projects/**` is acceptable.
- Never read entire Claude or Codex JSONL files.

Modes:

- `$plat` qualifies lenses from current session signals.
- `$plat worktree` widens to working-tree edits plus recent authored commits.
- `$plat <lens>` skips qualification and analyzes that lens.
- `$plat all` reports all discovered lenses.
- `$plat --do`, `$plat --bead`, `$plat --doc` skip the action prompt.

## Qualification

Roll file/path/bead/session heat up to lenses. Sort by heat.

- All lenses at or above 15% qualify.
- If one lens qualifies, produce a single-lens report.
- If 2-3 qualify, report the primary lens fully and list secondary gaps.
- If 4+ qualify, show the heat map and ask the user to narrow.
- Surface cross-lens correlations when two lenses share root-cause friction.

Always show the heat map and rationale before the gap report.

## Enrichment

For each qualified lens, load:

- Its `*plateau*.md` file.
- Parent epics from `parent::`, `blocks::`, or bead hierarchy.
- Relevant `AGENTS.md` and `CLAUDE.md` boundaries / always / never sections.
- Matching `docs/lessons/*.md`.
- Recent open beads in that scope.
- Cross-lens links.

If a qualified lens has no plateau definition, that is gap #1. `$plat --doc` should seed a present-tense `quality-plateau-gaps.md` or a proper `@km/<scope>/*plateau*.md` bead, whichever fits the repo pattern.

## Gap Report

Rank gaps by leverage. Each gap must include:

- Priority.
- File or bead reference, with line number when code/doc specific.
- One-sentence problem.
- Concrete acceptance criterion.
- Edge of context:
  - `in-context`: mechanical fix from loaded state.
  - `partial-context`: needs focused investigation before doing.

## Action Offer

Offer exactly these actions unless the user passed a flag:

```text
[DO]      work the highest-leverage gap now
[CAPTURE] file beads for remaining gaps with acceptance criteria
[DOC]     append or seed the lens quality plateau doc
[SKIP]    snapshot to .km/plat-snapshots/<date>.md
```

For multi-lens runs, offer full actions for the primary lens and default to CAPTURE-only for secondaries.

## Escalation

| Gap kind | Escalate to |
|---|---|
| Missing invariant test | `$tdd` |
| Architectural rethink | `$big` or `$why` |
| External prior art needed | `$deep` |
| Multi-model review needed | `$pro` |
| Performance | `$perf` |
| Root cause unclear | focused investigation |
| Missing plateau definition | `$plat --doc` |

## Maintenance

Keep this skill aligned with `.claude/skills/plat/SKILL.md`, but do not blindly copy Claude-only assumptions. Codex-specific session discovery should stay Codex-first.
