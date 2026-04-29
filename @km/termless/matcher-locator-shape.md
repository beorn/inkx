---
id: "@km/termless/matcher-locator-shape"
aliases:
  - km-termless.matcher-locator-shape
  - km-termless-matcher-locator-shape
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:35Z
closed_at: 2026-04-26T23:31:30Z
close_reason: >-
  Fixed in 9ebc2d663 (Option A — extend km-tui matchers to delegate to
  termless).


  ROOT CAUSE

  km-tui's `apps/km-tui/tests/helpers/matchers.ts` overrode termless's

  `toHaveText` and `toContainText` matchers (last-write-wins in vitest's

  expect.extend). When termless tests passed a RegionView or TerminalReadable,

  km-tui's matchers hit `assertAutoLocator` and threw the wrong error.

  `toContainText` already had a partial RegionView delegation but missed

  TerminalReadable; `toHaveText` had no delegation at all.


  WHY OPTION A

  - Both contracts are valid in km's monorepo (km-tui = AutoLocator;
    termless = RegionView/TerminalReadable). The setup imports termless
    matchers first then overrides — the overrides should extend, not erase.
  - The author had already established the delegation pattern for
    `toContainText` to RegionView; the real bug was that delegation was
    incomplete. Completing it is the smallest correct change.
  - Options B (rewrap termless tests in locators) and C (export a
    region-locator from termless) both require touching the termless test
    surface for a bug that's structurally on the km-tui side.

  FIX

  - Added `isRegionView`, `isTerminalReadable`, `isTermlessDomain` duck-type
    helpers (mirror termless's own type guards in `vendor/termless/src/assertions.ts`).
  - Both `toHaveText` and `toContainText` now early-return by delegating to
    `terminalMatchers` from `@termless/test` whenever the received value is a
    termless-domain object. AutoLocator and TestApp paths are unchanged.
  - Updated the `Matchers<T>` declaration to expose the optional `{ timeout }`
    argument so termless's auto-retry contract continues to work.

  VERIFICATION

  - bun vitest run --project vendor
  vendor/termless/packages/viterm/tests/matchers.test.ts
  vendor/termless/tests/integration.test.ts → 97 passed (was 5 fail / 92 pass)

  - bun vitest run --project vendor vendor/termless/ → 1179 passed (full
  termless suite)

  - bun vitest run --project default apps/km-tui/tests/ → 2534 passed (no
  regression)

  - bun vitest run → 8035 passed (full fast suite)

  - tsc --noEmit on matchers.ts → clean (no new errors)


  COMMITS

  9ebc2d663 fix(km-tui): delegate toHaveText/toContainText to termless for
  region/terminal shapes
---

# [x] [bug] vendor/termless matchers — 5 failures: toHaveText expects AutoLocator @km/termless #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

matchers.test.ts (4) + integration.test.ts (1). All fail with: 'toHaveText expects an AutoLocator, got object' from apps/@km/tui/tests/helpers/matchers.ts:44 assertAutoLocator. Either matchers helper hardened too aggressively, or termless tests need updating to use new shape. /complete: bun vitest run --project vendor vendor/termless/packages/viterm/tests/matchers.test.ts vendor/termless/tests/integration.test.ts → 0 failures.