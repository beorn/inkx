---
mentions:
  - km
id: "@km/tui1/3-add-headless-testing-infrastructure-force-tty"
aliases:
  - km-tui1.3
  - km-tui1-3
  - "@km/tui1/3"
created_at: 2026-01-16T23:45:57Z
closed_at: 2026-01-17T00:40:11Z
---

# [x] Add headless testing infrastructure (FORCE_TTY) @km/tui1 #task #P2

Backport the FORCE_TTY bypass from TUI2 to enable headless visual testing.

## Background

TUI2 implemented a FORCE_TTY=1 environment variable bypass (@km/tui2/19-add-env-var-to-bypass-tty-check-for-headless-testi) that allows running the TUI in headless mode via ttyd + Playwright for automated screenshot testing.

## Implementation

In the TUI1 entry point, add similar bypass:

```typescript
// Before TTY check
if (process.env.FORCE_TTY === '1') {
  // Skip TTY requirement for headless testing
}
```

## Testing Workflow

Once implemented, TUI1 can be tested headlessly:

```bash
pkill -f ttyd 2>/dev/null || true
FORCE_TTY=1 ttyd -W -p 7681 bun km view -r /tmp/vault @next.md &
sleep 3
HEADLESS=true bun x playwright screenshot http://localhost:7681 /tmp/tui1.png
```

## Acceptance Criteria

- [ ] FORCE_TTY=1 bypasses TTY requirement
- [ ] ttyd + Playwright workflow works for TUI1
- [ ] No regression in normal TTY operation

