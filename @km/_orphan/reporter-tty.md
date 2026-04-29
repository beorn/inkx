---
id: "@km/_orphan/reporter-tty"
aliases:
  - km-reporter-tty
created_at: 2026-01-28T07:26:28Z
closed_at: 2026-01-28T07:57:10Z
assignee: claude:8f1636c1
---

# [x] vitest-reporter should auto-detect TTY instead of requiring TERM=dumb @km/_orphan #bug #P2 @claude:8f1636c1

The package.json test scripts hardcode TERM=dumb to force non-TTY mode:

```json
"test:fast": "TERM=dumb bunx --bun vitest run --exclude='**/*.slow.*'"
```

This prevents users from seeing live updating output when running tests in a real terminal.

The reporter already has TTY detection:
```typescript
private get isTTY(): boolean {
  return (process.stdout.isTTY ?? false) && process.env.TERM !== 'dumb'
}
```

But the issue is that the reporter initializes BEFORE vitest-setup.ts runs (which sets process.stdout.isTTY = false), so it sees the real TTY status.

**Proposed fix:**
1. Remove TERM=dumb from package.json scripts
2. Have the reporter detect CI environments (CI, GITHUB_ACTIONS, etc.) and default to non-TTY
3. Check for a VITEST_REPORTER_TTY env var for explicit override
4. This allows: live updates in local dev, plain text in CI

**Acceptance criteria:**
- Running `bun run test:fast` in a terminal shows live updates
- Running in CI (or with CI=true) shows plain text output
- TERM=dumb still works as an override