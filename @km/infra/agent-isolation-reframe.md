---
mentions:
  - km
id: "@km/infra/agent-isolation-reframe"
aliases:
  - km-infra.agent-isolation-reframe
  - km-infra-agent-isolation-reframe
created_by: claude:2405c72e
created_at: 2026-04-28T21:48:44Z
closed_at: 2026-04-28T21:57:45Z
close_reason: "Subsumed by km-infra.orphan-branch-audit. The 'patch-apply'
  framing was scaffolding from the original /big that didn't survive two
  refinements: (1) branches-as-recovery-anchors are real, not just scar tissue,
  and (2) clean-finish is unobservable. Once those two facts are accepted,
  'patch-apply' is just the 'integrate' action in triage — cherry-pick vs merge
  vs squash is style, not architecture, for 1-3 commit bug-fix branches. The
  triage primitive (km-infra.orphan-branch-audit) is sufficient."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.agent-isolation-reframe
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-28T14:48:44Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] Agent isolation reframe — replace branch-API with patch-apply API between agents and lead @km/infra #feature #P2

blocks:: [[@km/infra]]

Currently /max worktree-isolated agents commit to branches and push to origin; the lead merges branches to main, then deletes the branches both locally and on origin. This generates churn (we deleted 23 local + 15 remote merged branches and 14 worktrees in one cleanup pass on 2026-04-28).

REFINED REFRAME (after /big follow-up — branches have TWO roles, not one):

1. **Integration unit** (lead merges branch → main): wrong tool. Creates the churn.
2. **Recovery anchor** (work survives agent termination — context-prune, user interrupt, API timeout, hook kill, network drop, parent crash): REAL and load-bearing. Cannot be dropped.

The split:

- **Clean finish path**: agent emits commits in sandbox → lead cherry-picks to main → sandbox + branch destroyed. NO remote branch ever needed. Drops push-to-origin contract + ls-remote verification.
- **Half-killed agent path**: sandbox preserved with branch named wip/<bead-id>. Lead triages later via /sop infra wip-triage (covered in @km/infra/orphan-branch-audit) — per branch: bead, last commit, divergence from main; offer integrate / continue-via-new-agent / discard.

What changes vs current:

- Drops push-to-origin (local branch is enough; if whole repo dies, that's a different recovery problem)
- Drops ls-remote verification (no remote to verify)
- Adds triage step (currently missing — branches accumulate because no step forces a decision)
- Keeps worktree-isolation for shared-package collisions (independent concern)
- Keeps WorktreeRemove hook's preserve-on-uncommitted-work behavior (the recovery anchor)

Quality rubric: current L0/L1 (defensive patches: commit-mandate, push-mandate, ls-remote verification) → target L4 (clean-finish path uses cherry-pick + destroy; recovery path only materializes on termination, not by default).

Phases:

1. Implement /sop infra wip-triage (@km/infra/orphan-branch-audit — the L1 stopgap)
2. Prototype clean-finish patch-apply path in /max skill + WorktreeRemove hook. Recovery path retained for crash case.
3. Validate on real /max runs — A/B vs branch-API.
4. Cut over /max default to clean-finish patch-apply.
5. Remove commit-AND-push contract from /max prompt; remove push verification; rename retained branches to wip/<bead-id> convention.

Reference: /big session 2026-04-28 evening (@km/session/0425-evening) + follow-up clarifying the integration/recovery split. Prior art: Cursor agent-mode, Aider, Codex, opencode all use sandbox+diff for clean finish; their recovery story varies.

