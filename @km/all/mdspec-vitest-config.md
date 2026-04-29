---
id: "@km/all/mdspec-vitest-config"
aliases:
  - km-all.mdspec-vitest-config
  - km-all-mdspec-vitest-config
created_by: Bjørn Stabell
created_at: 2026-04-16T21:08:05Z
closed_at: 2026-04-16T21:13:23Z
close_reason: Fixed in vendor/mdspec 2c59d31. Added
  vendor/mdspec/vitest.config.ts (standalone, no inherited setupFiles). Also
  fixed stale cell-width assertion (8.4 → 9.6, matching termless
  DEFAULT_CELL_WIDTH). All 143 mdspec tests pass; pre-commit hook unblocked. km
  submodule pointer bumped in 4319f9239.
owner: bjorn@stabell.org
---

# [x] [bug] mdspec vitest cannot run standalone — resolves km-infra setup path @km/all #bug #P2

Reproducer:
  cd vendor/mdspec
  bunx --bun vitest run tests/tape-plugin.test.ts -t "cols/rows fence"

Expected: test runs (passes or fails on its own merits).
Actual: vitest fails to load tests at all with:

  Error: Cannot find module '/Users/beorn/Code/pim/km/vendor/mdspec/packages/@km/infra/vitest/setup.ts'

Root cause:
mdspec has no vitest.config.ts of its own. Vitest walks up to find a
config and lands on km root's vitest config, which references
'packages/@km/infra/vitest/setup.ts' relative to the config file. But
when invoked from vendor/mdspec, vitest re-anchors that relative path
to mdspec's dir, producing the bogus
vendor/mdspec/packages/@km/infra/vitest/setup.ts path.

Symptoms hidden by:
- bun run ci in mdspec exits with this as a generic "1 fail" — easy to
  miss the real cause
- Pre-commit hook in mdspec blocks commits when this is the only
  failure (blocked our SOP cleanup pass — see session 2026-04-16)
- Standalone mdspec users (cloning the submodule directly outside km)
  cannot run vitest at all

Fix options:
1. Add vendor/mdspec/vitest.config.ts that does NOT reference @km/infra
   setup files — keeps standalone usage clean.
2. Make km root vitest config use absolute paths so re-anchoring
   doesn't break.
3. Hoist mdspec into km's vitest workspace projects so it inherits
   config explicitly.

Option 1 is the right move — vendor/CLAUDE.md says "bun test works
from the package root (not just from km root)" is part of the
standalone-ready checklist. mdspec violates this today.

Discovered during /sop all on 2026-04-16 while trying to commit a
formatting tweak in vendor/mdspec/src/plugins/tape.ts.