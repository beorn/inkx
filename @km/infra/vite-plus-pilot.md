---
mentions:
  - km
id: "@km/infra/vite-plus-pilot"
aliases:
  - km-infra.vite-plus-pilot
  - km-infra-vite-plus-pilot
created_by: claude:fed8de9e
created_at: 2026-03-25T21:26:26Z
owner: bjorn@stabell.org
---

# [ ] Pilot Vite Plus on flexily — when Bun package manager lands @km/infra #task #P3

Try Vite Plus on flexily as first migration target once `vp install` supports Bun package manager.

## Trigger

Vite Plus adds Bun as supported package manager (PR in progress). Check weekly.

## Plan

1. **flexily first** — smallest standalone package, already uses Vite for docs
  - Replace: oxlint config + oxfmt config + vitest.config + tsconfig + build script
  - With: single vite.config.ts
  - Verify: `vp lint`, `vp fmt`, `vp test`, `vp build`, `vp check` all work
  - Verify: `bun test` still works as fallback
  - Compare: build output size, test speed, lint speed
2. **If flexily works** → silvery (14 sub-packages, monorepo stress test)
3. **If silvery works** → termless, loggily, other vendors
4. **Last** → km root (most complex, has bun:sqlite deps)

## Weekly Check

- [ ] Visit https://github.com/voidzero-dev/vite-plus — is Bun PM merged?
- [ ] Check voidzero.dev/blog for release announcements
- [ ] If merged: claim this bead and start pilot

## What We Keep Regardless

- `bun` as runtime (bun:sqlite, Bun.serve)
- `bun test` for tests that need Bun APIs
- `bun km` for CLI

## Success Criteria

- flexily passes all 1530 tests via `vp test`
- Single vite.config.ts replaces 4+ config files
- No regression in lint/fmt/build speed
- Bun runtime still works for app code

