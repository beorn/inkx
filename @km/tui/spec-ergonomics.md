---
id: "@km/tui/spec-ergonomics"
aliases:
  - km-tui.spec-ergonomics
  - km-tui-spec-ergonomics
created_by: Bjørn Stabell
created_at: 2026-04-18T18:34:09Z
closed_at: 2026-04-18T18:44:39Z
close_reason: Barrel import, public app.state.omnibox/status,
  toHaveStatus/toHaveOmnibox matchers, 7 specs migrated. 6 withStore() leaks
  removed from omnibox.spec, 4 getStatus()?.message replaced with toHaveStatus
  in board.spec. 65/65 spec tests pass, 2331/2331 km-tui fast suite passes.
  Commit 69ae7c618.
---

# [x] Make .spec.ts files even more ergonomic @km/tui #task #P2 @Bjørn Stabell

blocks:: [[@km/tui]]

Flagship .spec.ts files were curated in @km/all/test-system/plateau-enforcement but each test still carries 70 chars of 'using app = createTestApp(item(...))' ceremony, 4 imports, and mixes 3 assertion styles. The fixture (test.extend) was built but never adopted by any spec. This bead closes the readability gap: one import, one fixture line, one blessed assertion form per question.