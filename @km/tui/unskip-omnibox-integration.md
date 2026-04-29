---
id: "@km/tui/unskip-omnibox-integration"
aliases:
  - km-tui.unskip-omnibox-integration
  - km-tui-unskip-omnibox-integration
created_by: Bjørn Stabell
created_at: 2026-04-18T19:14:59Z
closed_at: 2026-04-18T19:15:57Z
close_reason: "Fixed in d1f2a0eca (feat/test-system). Root cause: test driver's
  handleKey-before-originalPress order committed omnibox mount before input
  emit, causing double-echo. Fix: detect when handleKey opened a singleton
  overlay and skip originalPress for that keystroke. Also updated 2 stale test
  expectations. 27/27 omnibox-integration tests pass, 2334/2334 full km-tui fast
  suite passes."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-tui.unskip-omnibox-integration
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-18T12:15:18Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Unskip 3 omnibox-integration tests blocked on sigil double-echo @km/tui #task #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

Three integration tests were skipped in 014bb88b4 + 61c5907c0 waiting for @km/tui/omnibox-quality-plateau (now closed) to address the :-key double-echo:

- typing ':go' in command-palette mode filters command results
- slippery sigil rule fires: ':cr' + '@' → '@cr'  
- dialog width is stable across frames as results stream in

Root cause was in the test driver, not production: driver.ts called handleKey synchronously in an act() block BEFORE calling silvery's originalPress(). This committed the omnibox mount BEFORE the input emitter fired, so the freshly-mounted TextInput echoed the sigil keystroke into its buffer.

Fix: in driver.ts driverPress(), detect when handleKey opened a singleton overlay during the current press. If so, skip originalPress — the keystroke was consumed by the command system, and replaying it into the now-mounted TextInput would produce a double-echo.

Also: 'cmd:' namespace prefix check in the :go test was stale (rows now use kind discriminator, not prefixed ids), and double-border scan in the width test was stale (omnibox is borderless by design).