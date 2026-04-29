---
id: "@km/infra/submodule-integrity-check"
aliases:
  - km-infra.submodule-integrity-check
  - km-infra-submodule-integrity-check
created_by: claude:cc081a9a
created_at: 2026-04-27T05:46:17Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.submodule-integrity-check
    depends_on_id: km-infra.guardrails
    type: parent-child
    created_at: 2026-04-26T23:18:26Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [ ] Pre-commit / bun worktree check for stale submodule gitlinks @km/infra #feature #P3

blocks:: [[@km/infra/guardrails]]

vendor/termless had a stale gitlink at sites/terminfo.dev that blocked worktree creation ('fatal: No url found for submodule path'). Operational fix: removed the gitlink + added .gitignore entry. Plateau: structural prevention — a check that fails fast at commit/worktree time when a directory looks like a gitlink but isn't registered in .gitmodules.

Approach:
- Pre-commit hook: walk staged tree mode 160000 entries, verify each has a .gitmodules entry with a URL
- bun worktree script: same check before invoking isolate.sh
- Make it a script in packages/@km/infra/scripts and wire to both

Files in scope:
- packages/@km/infra/scripts/check-submodule-integrity.sh (new)
- .claude/lib/isolate.sh or wrapper (call the check first)
- .git/hooks/pre-commit or husky equivalent

/complete:
- A test fixture creates a stale gitlink and the check fails with a useful message
- bun worktree create on a vault with a stale gitlink fails BEFORE attempting cp -c -R
- Existing bun worktree flow on healthy repo unchanged (no perf regression)


## Quality rubric (hub/quality-rubric.md)
Current level: L0 — operational fix for vendor/termless stale gitlink: removed the gitlink + added .gitignore entry. Pure manual cleanup with no preventive structure.
Target level: L3 — pre-commit hook + bun worktree wrapper that walks staged tree mode 160000 entries and verifies each has a .gitmodules entry. API-level structure (the check is on the path of every commit/worktree-create) makes the bad state hard to introduce; not L4 because someone editing .git plumbing directly can still bypass.
