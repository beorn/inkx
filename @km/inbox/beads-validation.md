---
id: "@km/_orphan/beads-validation"
aliases:
  - km-beads-validation
created_at: 2026-01-25T12:20:04Z
closed_at: 2026-01-25T12:25:16Z
assignee: unimac
---

# [x] Add runtime validation for BeadsIssue JSON parsing @km/_orphan #task #P2 @unimac

JSON.parse results are cast without validation in beads sync/migrate.

**Location**: 
- packages/@km/beads/src/sync.ts:113
- packages/@km/beads/src/migrate.ts:61

**Risk**: Malformed JSON lines would silently become invalid BeadsIssue objects.

**Fix**: Add Zod schema for BeadsIssue and validate on parse.

**Acceptance criteria**:
- [ ] Create Zod schema matching BeadsIssue type
- [ ] Validate all JSON.parse calls
- [ ] Add error handling for invalid lines