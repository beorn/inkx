---
id: "@km/infra/vitest-typecheck"
aliases:
  - km-infra.vitest-typecheck
  - km-infra-vitest-typecheck
created_by: claude:97b8de73
created_at: 2026-02-23T00:53:45Z
closed_at: 2026-03-03T10:20:28Z
owner: bjorn@stabell.org
assignee: claude:97b8de73
---

# [x] vitest doesn't type-check: stale types pass silently @km/infra #task #P2 @claude:97b8de73

Vitest (via bun) transpiles but never type-checks test files. This means stale property names, wrong argument types, and removed APIs pass tests silently. Found during fold refactor: 15 test files had foldedNodes: Set<string> references after migration to foldDepths: Map<string, number> — all passed because TypeScript structural typing + no compile step.

Options:
1. Add tsc --noEmit to test:fast (catches type errors but adds ~10-20s)
2. Run tsc --noEmit in CI only (cheaper but slower feedback)
3. Use vitest-tsconfig-paths with typecheck mode
4. Accept and rely on /complete audits to catch remnants

The fold refactor is the case study — 15 files passed with wrong mock shapes because JS doesn't care about extra/missing properties at runtime.