---
mentions:
  - km
id: "@km/silvery/km-migrate"
aliases:
  - km-silvery.km-migrate
  - km-silvery-km-migrate
created_by: claude:55df8ef1
created_at: 2026-03-09T18:28:19Z
closed_at: 2026-03-09T20:32:50Z
close_reason: Complete. 190 files rewritten, 6 vendor submodules updated, all
  tests pass. Commit 65ad41de.
owner: bjorn@stabell.org
---

# [x] Migrate km imports: hightea/decant/swatch → silvery/loggily @km/silvery #task #P2

Final step: update all imports in km codebase from old names to new silvery packages.

## Use batch refactor tool

```bash
bun tools/refactor.ts --from '@hightea/term' --to '@silvery/react' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from '@hightea/term/runtime' --to '@silvery/term/runtime' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from '@hightea/term/store' --to '@silvery/tea' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from '@hightea/term/core' --to '@silvery/tea/core' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from '@hightea/term/tea' --to '@silvery/tea/zustand' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from '@hightea/term/testing' --to '@silvery/test' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from '@hightea/ansi' --to '@silvery/ansi' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from 'swatch' --to '@silvery/theme' --glob 'src/**/*.{ts,tsx}'
bun tools/refactor.ts --from 'decant' --to 'loggily' --glob 'src/**/*.{ts,tsx}'
```

## Also update

- package.json dependencies
- tsconfig paths
- vitest configs
- CLAUDE.md files (all levels)
- .claude/skills/ docs
- Git submodule URLs (vendor/hightea → vendor/silvery, vendor/decant → vendor/loggily, vendor/swatch removed)

