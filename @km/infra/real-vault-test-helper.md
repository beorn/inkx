---
id: "@km/infra/real-vault-test-helper"
aliases:
  - km-infra.real-vault-test-helper
  - km-infra-real-vault-test-helper
created_by: claude:8b5b9e1c
created_at: 2026-04-20T20:19:07Z
---

# [ ] Fast real-vault snapshot test helper for TDD @km/infra #feature #P3

blocks:: [[@km/infra]]

Why-5 from column-top-disappears retro. TTY at 200×120 on ~/Bear/Vault takes ~30s to start — too slow for tight TDD iteration. Build cached-state test helper so writing tests against real vault geometry is fast (<2s). Let tests assert on actual column renders, not synthetic items. Related to apps/@km/tui/tests — possibly extend existing createTestApp / driver helpers with vault-snapshot loader.