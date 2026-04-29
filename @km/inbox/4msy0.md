---
id: "@km/_orphan/4msy0"
aliases:
  - km-4msy0
created_by: claude:c9beade3
created_at: 2026-03-13T23:21:14Z
closed_at: 2026-03-13T23:45:56Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] termless: command execution has shell-injection/quoting bugs @km/_orphan #bug #P1 @claude:c9beade3

Found by GPT 5.4 Pro review (2026-03-13).

File: src/pty.ts:47-68
Classification: P1

command: string[] is joined with spaces and run as bash -c. Structured argv from CLI/MCP is reinterpreted by the shell — spaces, quotes, globbing, $(), and ; change meaning.

Suggested fix: Spawn program directly as [program, ...args]. Add explicit shellCommand: string path if shell mode is needed.