---
mentions:
  - silvery
  - km
  - claude
id: "@km/terminfo/cli-silvery"
aliases:
  - km-terminfo.cli-silvery
  - km-terminfo-cli-silvery
created_by: claude:4929065a
created_at: 2026-04-01T20:54:14Z
closed_at: 2026-04-01T21:07:26Z
close_reason: "Done: all manual ANSI codes replaced with @silvery/ansi
  createStyle(). Interactive post-test SelectList prompt (Submit/Skip) for new
  and known terminals. Non-TTY fallback. Commit 8e810cd."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] terminfo.dev CLI: switch to silvery + @silvery/commander for rich TUI output @km/terminfo #feature #P3 @claude:4929065a

Switch terminfo.dev CLI from console.log + ANSI escapes to silvery + @silvery/commander.

## Scope

- Rich TUI output for all commands (detect, test, submit, default help)
- Progress indicator during probing
- Colored pass/fail results table
- New terminal banner (★) with interactive submit prompt (SelectList: Submit / Skip)
- Known terminal: softer "Submit updated results?" prompt
- Keep --json mode unchanged (raw JSON, no TUI)
- Inline mode (not fullscreen) — CLI must work in pipes/CI

## Interactive post-test flow

After test results are shown:

- If NEW terminal: show prominent banner + SelectList with "Submit to terminfo.dev" / "Skip"
- If KNOWN terminal: show subtle "Submit updated results?" / "Skip"
- On Submit: run the submit flow inline (reuse existing submit logic)
- On Skip: exit cleanly

