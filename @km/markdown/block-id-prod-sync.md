---
id: "@km/markdown/block-id-prod-sync"
aliases:
  - km-markdown.block-id-prod-sync
  - km-markdown-block-id-prod-sync
created_by: Bjørn Stabell
created_at: 2026-04-14T18:15:50Z
closed_at: 2026-04-14T18:28:18Z
close_reason: "Fixed in two commits: 0d9efb31b (resolver: ^id lookup for
  non-numeric block ids) + 8e30b2f9c (write path: block_id column added to
  applyNodeCreated INSERT + CHILD_DIFF_FIELDS + FILE_DIFF_FIELDS). E2E roundtrip
  test at packages/km-storage/tests/e2e/block-id-roundtrip.test.ts verifies the
  full create + edit path through fs-watch. Taxes's workaround of inlining
  @next.md task content is no longer needed."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-markdown.block-id-prod-sync
    depends_on_id: km-markdown
    type: parent-child
    created_at: 2026-04-14T11:16:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] kmBlockIdTransform doesn't run in prod sync path — block_id column stays null @km/markdown #bug #P1 @Bjørn Stabell

blocks:: [[@km/markdown]]

Reported by tribe member 'taxes' 2026-04-14.

**Symptom**: Custom ^ids (e.g., `^ab12`, `^simple-id`, `^apr15-ca-ftb`) get stripped from node content but are NOT persisted to the block_id column in .km/state.db. Affects paragraphs, list items, tasks, and tasks+props.

**Repro**: Write `- [ ] task ^testid` anywhere in a vault file, run km sync, then `km show '^testid'` → 'Node not found'.

**Impact**: Blocks `![[file#^id]]` transclusions. Currently working around by inlining task content in @next.md. Blocks clean canonical-task model for @next.md / @agent.md.

**Diagnosis** (from taxes):
- Unit tests at `packages/km-markdown/tests/extensions/km-block-id.test.ts` PASS because they call `kmBlockIdTransform(tree)` manually after parsing
- Prod registers the hook via `transforms:` in `packages/km-markdown/src/extensions/index.ts:61` but the hook isn't firing
- Likely causes (per taxes): (a) `transforms:` hook not invoked by mdast-util-from-markdown in km's version, OR (b) conflict with `kmTaskMark()` micromark extension that the unit test's plain-GFM pipeline doesn't cover

**Verification**:
1. Create test markdown with `- [ ] task ^testid`
2. Run the prod sync path (km view / km sync)
3. Query the DB: `sqlite3 .km/state.db "SELECT id, content, block_id FROM nodes WHERE content LIKE '%testid%'"`
4. Expected: block_id = 'testid'
5. Actual (bug): block_id = null, content has ^ stripped

Tribe coordination: fixer session picked this up immediately.