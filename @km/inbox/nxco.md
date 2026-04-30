---
id: "@km/inbox/nxco"
aliases:
  - km-nxco
  - "@km/_orphan/nxco"
created_at: 2026-01-15T14:05:24Z
closed_at: 2026-01-15T23:56:54Z
---

# [x] Test gap analysis and migration plan @km/_orphan #task #P3

Analyze the gap between the testing guide (specs/@km/testing/md) and current test coverage. Create a comprehensive migration plan.

## Analysis Required

### 1. Inventory Current Tests
Run analysis to categorize existing tests:
```bash
# Count tests per package
for pkg in packages/km-* apps/km-cli; do
  echo "=== $pkg ==="
  find "$pkg" -name "*.test.ts" -o -name "*.test.tsx" | xargs wc -l 2>/dev/null
done

# Categorize by type (unit vs integration)
grep -r "beforeEach.*mkdirSync\|beforeAll.*mkdirSync" packages apps --include="*.test.ts" | wc -l
```

### 2. Gap Analysis per Layer

| Layer | Guidance (from @km/testing/md) | Current State | Gaps |
|-------|------------------------------|---------------|------|
| Parser | 90% coverage, round-trip tests | ? | ? |
| Store | 85% coverage, integration tests | ? | ? |
| Sync | 80% coverage, conflict scenarios | ? | ? |
| State | 95% coverage, all BoardActions | ? | ? |
| Components | 70% coverage, prop combinations | ? | ? |
| CLI | 80% coverage, error paths + mdtest | ? | ? |

### 3. Specific Gaps to Identify

1. **Missing BoardAction tests**: Compare `BoardAction` union type members against `boardReducer.test.ts`
2. **Missing CLI command tests**: Compare registered commands against test coverage
3. **Missing error path tests**: Grep for `throw` and `console.error` without corresponding tests
4. **Missing mdtest golden files**: CLI commands without `.test.md` coverage
5. **@km/_orphan/sh integration**: No mdtest files using `km sh` yet

### 4. Migration Plan

Create prioritized list of new tests to write:

#### High Priority (P1)
- [ ] Create `tests/tui-navigation.test.md` using @km/_orphan/sh + mdtest
- [ ] Add missing BoardAction tests for new actions (PROJECT_PICKER_*, TOGGLE_DETAIL_PANE)
- [ ] Add error path tests for CLI commands

#### Medium Priority (P2)
- [ ] Expand sync conflict scenario tests
- [ ] Add component prop combination tests
- [ ] Create mdtest files for each CLI command

#### Low Priority (P3)
- [ ] Increase round-trip test coverage
- [ ] Add performance regression tests
- [ ] Document test patterns in examples

### 5. Deliverables

1. **Gap report** in `specs/test-gap-analysis.md`
2. **Test migration backlog** as beads (one per test category)
3. **Sample @km/_orphan/sh mdtest file** demonstrating the pattern
4. **Updated coverage metrics** in `specs/km-testing.md`

## Acceptance Criteria

- [ ] Gap analysis completed and documented
- [ ] Migration plan prioritized by impact
- [ ] At least one sample @km/_orphan/sh + mdtest file created
- [ ] Beads created for high-priority test gaps