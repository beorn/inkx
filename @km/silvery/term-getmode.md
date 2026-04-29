---
id: "@km/silvery/term-getmode"
aliases:
  - km-silvery.term-getmode
  - km-silvery-term-getmode
created_by: Bjørn Stabell
created_at: 2026-04-01T06:44:04Z
closed_at: 2026-04-01T07:14:16Z
close_reason: "Fixed. Three issues: (1) termless isTerminalReadable rejected
  Proxy-based terms (typeof function vs object), (2) emulator-backed Term stdout
  pointed at process.stdout instead of emulator, (3) run() emulator path used
  headless mode which skipped protocol setup. Also moved alt screen management
  into pause/resume in createApp."
---

# [x] Term wrapper should delegate all TerminalReadable methods from emulator backend @km/silvery #task #P2

Term wraps a termless Terminal via createMixedStyle Proxy. The Proxy delegates style chain + termBase properties, but the in operator / method delegation gets lost through the Proxy layers.

Current: createTermless() -> createTerm(backend, dims) -> createMixedStyle(style, termBase) -> Proxy
Problem: Proxy's has/get traps lose TerminalReadable methods (getMode, getCursor, getCell, etc.)
Result: expect(term).toBeInMode('altScreen') fails because toBeInMode can't find getMode

Design options:
1. Composition: withSilveryTerm(createTermless()) — Term delegates to the Terminal
2. Fix Proxy: ensure Object.defineProperty on termBase is visible through the Proxy
3. Skip Proxy: Term implements TerminalReadable directly by delegating to emulator

Also: review testing docs to promote termless for ALL terminal feature tests (alt screen, ANSI escapes, cursor, modes). State-level tests are insufficient.