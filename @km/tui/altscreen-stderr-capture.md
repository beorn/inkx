---
id: "@km/tui/altscreen-stderr-capture"
aliases:
  - km-tui.altscreen-stderr-capture
  - km-tui-altscreen-stderr-capture
created_by: claude:da9990c5
created_at: 2026-04-28T05:06:31Z
closed_at: 2026-04-28T05:28:53Z
close_reason: "Shipped in
  vendor/silvery/packages/ag-term/src/runtime/devices/console.ts:
  Console.capture() now installs process.on('warning', handler). Listener
  presence alone tells Node to skip its default stderr writer, sealing the alt
  screen. Handler taps the warning into the entry buffer (method:'warn',
  stream:'stderr') for stats + replay parity. Re-emits to stderr when
  suppress=false. 4 new tests in vendor/silvery/tests/features/console.test.ts
  incl. real yaml.parse(broken) → 0 stderr leak. Reverted defensive
  logLevel:'error' in km-markdown — fix lives at the silvery sub-owner layer per
  Silvery Way principle 11 (Term owns I/O)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.altscreen-stderr-capture
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-27T22:07:10Z
    created_by: claude:da9990c5
    metadata: "{}"
---

# [x] Capture process.emitWarning during alt-screen so foreign warnings don't bleed @km/tui #bug #P2

blocks:: [[@km/tui]]

term.console patches console.* but process.emitWarning() bypasses it (Node uses the process-level warning channel). yaml@2 BAD_ALIAS warnings, deprecation notices, and any future foreign-library warning leaks straight to stderr and corrupts the alt screen.

## Concrete cases seen
- yaml@2 BAD_ALIAS (root-caused + fixed at the call site in @km/beads/cutover by switching to yaml.stringify + logLevel:'error', but the *capture gap* remains for any future warning source)

## Fix
Add a process.on('warning', …) tap to silvery's term.output (or term.console) during alt-screen mode. Tap should:
- Format the warning into a console.error-shaped entry
- Route via the existing console-router suppress/redirect policy
- Replay on exit (same as captured console.* entries)

## Acceptance
- A test fires process.emitWarning('test') during alt-screen — alt screen unchanged, warning visible in inline replay on exit
- yaml.parse with malformed input no longer corrupts alt-screen even at default logLevel
