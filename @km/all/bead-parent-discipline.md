---
mentions:
  - km
id: "@km/all/bead-parent-discipline"
aliases:
  - km-all.bead-parent-discipline
  - km-all-bead-parent-discipline
created_by: claude:cc081a9a
created_at: 2026-04-27T18:02:18Z
closed_at: 2026-04-27T18:51:34Z
close_reason: "Shipped 2026-04-27. Preventive hook at tools/bd-parent-hook.ts
  wired in .claude/settings.json PreToolUse Bash matcher (project-shared,
  committed). Hook auto-chains 'bd update <id> --parent <prefix>' when bd create
  --id is invoked without --parent and the prefix matches an existing epic.
  Smoke-tested 4 branches: auto-chain, already-parented passthrough, non-bd
  passthrough, no-matching-epic soft hint. Reactive workflow (/complete Step 0a,
  /pm retro Step 1b) handles historical drift; this hook prevents new drift."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.bead-parent-discipline
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-27T11:02:18Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [x] Bead parent-link discipline — preventive hook + retroactive doctor @km/all #task #P2

blocks:: [[@km/all]]

Two gaps surfaced during plateau-90 retro (2026-04-27): (1) bd create --id and --parent cannot combine, so the second --parent step is fragile and gets skipped under load; (2) cross-cutting program epics (@km/all.<program>) end up with zero direct children when slice-level epics (@km/silvery.<slice>) own the work but don't roll up.

## Preventive (P2)

PreToolUse hook on Bash matching 'bd create' that:

- Infers parent from ID prefix (@km/silvery/foo → @km/silvery, @km/all/bar → @km/all)
- Warns if no --parent AND a matching epic exists
- Optionally auto-adds --parent <inferred> via tool input modification (PreToolUse permissionDecision.updatedInput)
- ~80 LOC TS hook in tools/ or .claude/hooks/

## Reactive (P3)

bd doctor --check=orphans-by-prefix that flags beads where ID prefix matches a known epic but bead has no parent. Run via /sop infra. ~50 LOC bd extension or wrapper script.

## Workflow updates already shipped

- /complete Step 0a: re-parent orphans before tree walk
- /pm retro Step 1b: retroactively re-parent program beads found in design/retro doc

Both compose: hook prevents new drift, doctor finds historical drift, workflows do retroactive repair.

