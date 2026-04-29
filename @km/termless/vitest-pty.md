---
id: "@km/termless/vitest-pty"
aliases:
  - km-termless.vitest-pty
  - km-termless-vitest-pty
created_by: claude:4a5961be
created_at: 2026-03-16T22:05:40Z
closed_at: 2026-03-19T17:31:13Z
close_reason: "Fixed: separate pty vitest project with setup-pty.ts (no isTTY
  breaking). Tests renamed to .pty.test.ts. Added test:pty script, updated
  test:all and CI. Test: 8 PTY tests pass."
owner: bjorn@stabell.org
assignee: claude:21c57d63
---

# [x] vitest worker threads break Bun PTY input @km/termless #bug #P2 @claude:21c57d63

vitest setup sets process.stdout/stderr.isTTY=false and intercepts process.stdout.write, which prevents Bun.spawn PTY from delivering input to the child process. Works in standalone bun run scripts. Mouse tests in mouse.slow.spec.ts are skipped pending this fix. Potential fixes: (1) fix in termless spawnPty to restore isTTY, (2) fix vitest setup to not break PTY, (3) run PTY tests in a separate vitest project without the setup.