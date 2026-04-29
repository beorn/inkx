---
id: "@km/infra/destructive-op-guard"
aliases:
  - km-infra.destructive-op-guard
  - km-infra-destructive-op-guard
created_by: Bjørn Stabell
created_at: 2026-04-09T06:47:21Z
owner: bjorn@stabell.org
---

# [ ] Guard destructive operations when concurrent agents are active @km/infra #feature #P2

Prevent agents from accidentally destroying each other's work with destructive operations.

## Problem
CLAUDE.md bans destructive git ops but enforcement is by convention. Agents occasionally do git reset, checkout ., rm -rf, or bun install while others are working. These ops silently destroy uncommitted work.

## Scope
Phase 1 (git hook): reject common destructive git commands when tribe has >1 session
- git reset --hard, git checkout ., git restore, git clean -f, git stash
- Check via pre-commit hook or wrapper script
- Query tribe session count before allowing

Phase 2 (tribe protocol): announce-before-mutate for broader destructive ops
- tribe lock "reason" / tribe unlock — distributed advisory locking
- Covers: bun install, rm -rf on shared dirs, DB deletion, process kills
- Daemon mediates: warns, blocks, or requires acks from affected sessions

Phase 3 (file-level): per-file claim tracking
- Already partially exists via tribe broadcast ("files claimed: X, Y, Z")
- Formalize: tribe claim <file>, tribe release <file>
- Daemon warns on conflicting claims