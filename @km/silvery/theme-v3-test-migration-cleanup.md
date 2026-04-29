---
id: "@km/silvery/theme-v3-test-migration-cleanup"
aliases:
  - km-silvery.theme-v3-test-migration-cleanup
  - km-silvery-theme-v3-test-migration-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-19T05:41:23Z
closed_at: 2026-04-19T05:48:55Z
close_reason: Shipped at silvery cc650f74 + km bump. setActiveTheme() deleted
  entirely, mono-tier-attrs.test.tsx migrated to withTheme(theme, fn) helper
  using pushContextTheme/popContextTheme with proper try/finally. 28/28 tests
  pass.
---

# [x] Migrate mono-tier-attrs.test.tsx to pushContextTheme+pop helper @km/silvery #task #P4

blocks:: [[@km/silvery]]

mono-tier-attrs.test.tsx uses setActiveTheme(theme) which is now a no-op (after R2 AgNode cascade). Tests currently pass by luck — ansi16DarkTheme is the default theme, so the no-op doesn't matter. Migrate to a withTheme(theme, fn) test helper that properly push/pops the context stack. Low priority: current tests aren't broken, just vestigial.