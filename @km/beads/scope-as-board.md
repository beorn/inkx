---
id: "@km/beads/scope-as-board"
aliases:
  - km-beads.scope-as-board
  - km-beads-scope-as-board
created_by: claude:da9990c5
created_at: 2026-04-28T06:29:38Z
closed_at: 2026-04-28T08:02:02Z
close_reason: Shipped this session. BeadsConfig stripped to {prefix} only;
  migrate.ts derives @<prefix>/<scope> heading sigil from canonical id
  (km-beads.cutover → @km/beads); files land at <repoRoot>/<scope>/<slug>.md (no
  /issue prefix). bd-load-config.ts, bd-config.ts, bd.ts, bd-migrate.ts updated;
  formatScopeMessage simplified to take only scopePath. config.test.ts updated
  for new shape. Re-migrated /tmp/km-bd-pathform-proof/ with 4690 issues —
  verified @km/<scope> per-issue tags + scope dirs at vault root. Stray
  ~/Code/pim/km/issue/km-infra-typecheck-oom.md moved to infra/typecheck-oom.md.
  All 1494 tests pass across km-storage, km-beads, km-cli.
---

# [x] Drop beads.board/beads.parent — id scope IS the board (km-beads.X → beads/X.md, @km/beads/X) @km/beads #feature #P2 @claude:da9990c5

blocks:: [[@km/beads]]

## Current state

bd id structure: km-<scope>.<slug>. The vault config has three knobs that overlap:
- beads.prefix: 'km'    (vault sigil for cross-vault refs)
- beads.board: 'issue'  (heading tag emitted as @issue)
- beads.parent: 'issue/' (filesystem directory all issues go under)

Result for @km/beads/cutover:
- file: <vault>/issue/beads/cutover.md  ← extra 'issue/' prefix
- heading: '# [x] Title @issue #task #P2'
- cross-ref: '@km/beads/cutover'

## Desired state

bd id alone defines the location and board. No board/parent config knob.

Result for @km/beads/cutover:
- file: <vault>/beads/cutover.md
- heading: '# [x] Title @beads #task #P2'  (scope-derived tag)
- cross-ref: '@km/beads/cutover' (unchanged)

## Why

User feedback (2026-04-28): seeing 'issue/' in the path was a surprise. The bd id already encodes scope; routing every scope through 'issue/' obscures that. Per-scope directories at vault root match the mental model — a vault has many boards (beads, silvery, tui, …), each scope IS its own board.

Frees up 'issue/' for whatever else (or nothing). Drops two redundant config knobs.

## Scope of change

1. packages/@km/storage/src/config.ts — drop board/parent defaults; keep prefix
2. packages/@km/beads/src/migrate.ts — issueToMarkdown derives boardTag from path-form's first segment when not explicitly passed
3. apps/@km/_orphan/cli/src/commands/bd-migrate.ts — targetDir defaults to repoRoot (not <repoRoot>/issue)
4. /pm skill — update any board-filter examples (bd list --board=issue → bd list --board=beads, etc.)
5. @km/tui — board view query needs to match @<scope> sigils generally, not just @issue
6. docs — vault layout examples
7. existing data — move ~/Code/pim/km/issue/@km/infra-typecheck-oom/md to the right scope dir (if it's an infra issue, → infra/typecheck-oom.md)

## Backward compat

Honor beads.board/beads.parent when explicitly set in .km/config.yaml (legacy override). New default: undefined → scope-derived.

## Acceptance

- Migrate 4675 issues from .beads/issues.jsonl → vault has no top-level 'issue/' dir; instead 80+ scope dirs (beads/, silvery/, tui/, all/, …) at vault root
- bd list / bd ready / bd show / bd children continue to work
- Cross-refs in prose (@km/beads/cutover) still resolve