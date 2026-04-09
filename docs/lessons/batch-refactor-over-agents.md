# Batch Refactor Over Per-File Agents

**TL;DR**: For surgical migrations across many files, use batch refactor editsets — not background agents. Editsets let you review all changes at once; agents grind for hours and die on API overload.

---

## The Incident

The test-system migration needed to convert 53 test files from `testEnv()` to `createTestApp()`. The approach: spawn background agents, one batch of files each, each agent reads the file, decides which tests to migrate, and edits.

Results:
- 15+ agents spawned across the session
- 6 died on API overload (529 errors) with zero work done
- Each surviving agent took 5-15 minutes per file
- Agents made inconsistent surgical decisions
- Total wall time: hours for work that should take minutes

## The Better Way

`bun vendor/bearly/tools/refactor.ts` with editsets:

```bash
# 1. Generate editset (proposes all changes, doesn't apply)
bun vendor/bearly/tools/refactor.ts migrate \
  --from testEnv --to createTestApp \
  --dry-run --output /tmp/edits

# 2. Review the editset JSON — one pass, all changes visible
cat /tmp/edits/*.json

# 3. Apply (checksum-protected, skips drifted files)
bun vendor/bearly/tools/refactor.ts editset.apply /tmp/edits/*.json

# 4. Verify
npx tsc --noEmit && bun run test:fast
```

For surgical decisions (some tests migrate, some don't): the editset includes all candidates. You review and remove the ones that shouldn't change. One review pass, not 15 agent sessions.

## The Rule

| Task | Tool | Why |
|------|------|-----|
| Mechanical find-replace across files | `pattern.replace` + editset | Deterministic, instant, reviewable |
| Surgical migration (some yes, some no) | `pattern.migrate` + editset review | All decisions in one pass |
| Complex rewrite (store→screen assertions) | Agent (single focused) | Needs judgment per test |
| Research / architecture decision | Agent (Explore) | Needs breadth |

**Use agents when the VALUE is judgment.** Use batch refactor when the VALUE is throughput. The test migration had ~80% throughput work and ~20% judgment — should have been batch refactor for the 80%, agent for the 20%.

## See Also

- [Sync Test API](sync-test-api.md) — related lesson from the same session
- `vendor/bearly/skills/batch-refactor/SKILL.md` — full batch refactor docs
