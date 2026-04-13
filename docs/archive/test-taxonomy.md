# Test Taxonomy

Generated: 2026-01-23

## Summary

| Category            | Files | Tests  | Lines | Disposition            |
| ------------------- | ----- | ------ | ----- | ---------------------- |
| Core (fast)         | 77    | ~1,200 | ~18k  | keep                   |
| Sync (slow)         | 13    | ~140   | ~3k   | keep                   |
| Chaos/fuzzer        | 10    | ~160   | ~3k   | keep                   |
| Acceptance (mdspec) | 13    | ~200   | ~2k   | keep                   |
| Playwright          | 2     | 14     | 400   | **migrate to silvery**    |
| Vendor              | 37    | ~500   | ~10k  | keep (owned by vendor) |

## Action Items

### Migrate (2 files)

| File                                                                       | Tests | Reason                                             |
| -------------------------------------------------------------------------- | ----- | -------------------------------------------------- |
| tui.playwright.ts                   | 8     | Use silvery `createRenderer()` instead of browser |
| body-content.playwright.ts | 6     | Use silvery `createRenderer()` instead of browser |

### Navigation Tests - No Overlap (Verified)

The plan identified potential overlap between 3 navigation test files. Analysis shows they test **different concerns**:

| File                                                                           | Tests | What It Tests                                                           |
| ------------------------------------------------------------------------------ | ----- | ----------------------------------------------------------------------- |
| navigation.test.ts               | 16    | Pure `visualToStructural()` function - maps (depth, direction) → action |
| cursor-navigation.test.ts | 44    | Board reducer - state transitions via `NAV_TO_PATH`, `CURSOR_MOVE`      |
| visual-navigation.test.ts       | 30    | LayoutRegistry - finds cards by screen Y coordinate (curswantY)         |

**Verdict**: Keep all three. They are complementary, not duplicative.

---

## Parser Layer (@km/markdown)

| File                         | Tests | Lines | Type | Speed | Disposition |
| ---------------------------- | ----- | ----- | ---- | ----- | ----------- |
| markdown.test.ts             | 80    | 1,092 | core | fast  | keep        |
| roundtrip.test.ts            | 105   | 1,800 | core | fast  | keep        |
| properties.test.ts           | 26    | 265   | core | fast  | keep        |
| properties-roundtrip.test.ts | 34    | 444   | core | fast  | keep        |

## Tree Layer (@km/tree)

| File            | Tests | Lines | Type | Speed | Disposition |
| --------------- | ----- | ----- | ---- | ----- | ----------- |
| body.test.ts    | 27    | 159   | core | fast  | keep        |
| display.test.ts | 59    | 672   | core | fast  | keep        |
| queries.test.ts | 34    | 251   | core | fast  | keep        |

## Storage Layer (@km/storage)

### Core Tests

| File               | Tests | Lines | Type | Speed | Disposition |
| ------------------ | ----- | ----- | ---- | ----- | ----------- |
| repo.test.ts       | 25    | 638   | core | fast  | keep        |
| query.test.ts      | 106   | 1,635 | core | fast  | keep        |
| config.test.ts     | 19    | 326   | core | fast  | keep        |
| cas.test.ts        | 20    | 197   | core | fast  | keep        |
| path-utils.test.ts | 22    | 259   | core | fast  | keep        |
| resolve.test.ts    | 10    | 149   | core | fast  | keep        |
| links.test.ts      | 11    | 255   | core | fast  | keep        |
| store.test.ts      | 17    | 351   | core | fast  | keep        |
| rebuild.test.ts    | 11    | 222   | core | fast  | keep        |
| recurrence.test.ts | 28    | 177   | core | fast  | keep        |
| db-rules.test.ts   | 10    | 444   | core | fast  | keep        |
| parse-pool.test.ts | 7     | 135   | core | fast  | keep        |
| watcher.test.ts    | 9     | 240   | core | fast  | keep        |

### Sync Tests

| File                                  | Tests | Lines | Type | Speed | Disposition |
| ------------------------------------- | ----- | ----- | ---- | ----- | ----------- |
| watch/bidirectional-sync.slow.test.ts | 11    | 448   | sync | slow  | keep        |
| watch/ignore.test.ts                  | 31    | 315   | sync | fast  | keep        |
| watch/reconcile.test.ts               | 20    | 590   | sync | fast  | keep        |
| watch/sync.test.ts                    | 14    | 513   | sync | fast  | keep        |
| watch/watcher.test.ts                 | 17    | 247   | sync | fast  | keep        |
| watch/worker-thread.slow.test.ts      | 2     | 101   | sync | slow  | keep        |
| watch/writequeue.test.ts              | 26    | 691   | sync | fast  | keep        |
| e2e/sync-safety.test.ts               | 5     | 229   | sync | fast  | keep        |

### Chaos/Fuzzer Tests

| File                                 | Tests | Lines | Type       | Speed | Disposition         |
| ------------------------------------ | ----- | ----- | ---------- | ----- | ------------------- |
| sync/chaos/chaos.slow.test.ts        | 29    | 641   | chaos      | slow  | keep                |
| sync/chaos/concurrent.slow.test.ts   | 12    | 657   | chaos      | slow  | keep                |
| sync/chaos/db-to-fs.slow.test.ts     | 8     | 384   | chaos      | slow  | keep                |
| sync/chaos/mock-fs.test.ts           | 26    | 272   | chaos      | fast  | keep                |
| sync/chaos/regression.test.ts        | 2     | 170   | regression | fast  | keep (never delete) |
| sync/chaos/roundtrip.test.ts         | 23    | 418   | chaos      | fast  | keep                |
| testing/chaos-fake-repo.slow.test.ts | 21    | 307   | chaos      | slow  | keep                |
| testing/chaos-hooks.slow.test.ts     | 8     | 326   | chaos      | slow  | keep                |
| testing/chaos-report.slow.test.ts    | 10    | 386   | chaos      | slow  | keep                |
| testing/fake-repo.test.ts            | 23    | 302   | chaos      | fast  | keep                |

## Board Layer (@km/board)

| File                      | Tests | Lines | Type | Speed | Disposition |
| ------------------------- | ----- | ----- | ---- | ----- | ----------- |
| board-object.test.ts      | 16    | 309   | core | fast  | keep        |
| board-reducer.test.ts     | 51    | 628   | core | fast  | keep        |
| cursor-navigation.test.ts | 44    | 567   | core | fast  | keep        |
| curswant.test.ts          | 23    | 414   | core | fast  | keep        |
| navigation.test.ts        | 19    | 123   | core | fast  | keep        |
| node-map.test.ts          | 6     | 81    | core | fast  | keep        |
| selectors.test.ts         | 62    | 473   | core | fast  | keep        |
| transformers.test.ts      | 16    | 213   | core | fast  | keep        |
| zoom-cursor.test.ts       | 11    | 275   | core | fast  | keep        |

## TUI Layer (apps/km-tui)

### Core Tests

| File                         | Tests | Lines | Type | Speed | Disposition |
| ---------------------------- | ----- | ----- | ---- | ----- | ----------- |
| board-adapter.test.ts        | 4     | 149   | core | fast  | keep        |
| board-move-elaborate.test.ts | 20    | 608   | core | fast  | keep        |
| board-render.test.ts         | 8     | 167   | core | fast  | keep        |
| board-state.test.ts          | 7     | 89    | core | fast  | keep        |
| board.slow.test.ts           | 54    | 1,112 | core | slow  | keep        |
| card-positions.test.ts       | 30    | 466   | core | fast  | keep        |
| detail-pane.test.ts          | 31    | 423   | core | fast  | keep        |
| harness.test.ts              | 8     | 107   | core | fast  | keep        |
| visual-navigation.test.ts    | 19    | 742   | core | fast  | keep        |

### Layout Utilities

| File                     | Tests | Lines | Type | Speed | Disposition |
| ------------------------ | ----- | ----- | ---- | ----- | ----------- |
| layout/constrain.test.ts | 10    | 72    | core | fast  | keep        |
| layout/path.test.ts      | 11    | 111   | core | fast  | keep        |
| layout/truncate.test.ts  | 11    | 63    | core | fast  | keep        |
| layout/wrap.test.ts      | 9     | 69    | core | fast  | keep        |

### Text Utilities

| File               | Tests | Lines | Type | Speed | Disposition |
| ------------------ | ----- | ----- | ---- | ----- | ----------- |
| text/icons.test.ts | 17    | 107   | core | fast  | keep        |
| text/rich.test.ts  | 45    | 284   | core | fast  | keep        |

### Playwright (Migrate)

| File                       | Tests | Lines | Type       | Speed | Disposition         |
| -------------------------- | ----- | ----- | ---------- | ----- | ------------------- |
| tui.playwright.ts          | 8     | 230   | acceptance | slow  | **migrate to silvery** |
| body-content.playwright.ts | 6     | 169   | acceptance | slow  | **migrate to silvery** |

## CLI Layer (apps/km-cli)

### Core Tests

| File             | Tests | Lines | Type | Speed | Disposition |
| ---------------- | ----- | ----- | ---- | ----- | ----------- |
| cli-unit.test.ts | 28    | 432   | core | fast  | keep        |
| cli.slow.test.ts | 75    | 1,592 | core | slow  | keep        |

### mdspec Acceptance Tests

| File                       | Tests | Lines | Type       | Speed | Disposition |
| -------------------------- | ----- | ----- | ---------- | ----- | ----------- |
| sh/cmd-mode.spec.md        | ~6    | 82    | acceptance | fast  | keep        |
| sh/history.spec.md         | ~11   | 113   | acceptance | fast  | keep        |
| sh/json-mode.spec.md       | ~18   | 151   | acceptance | fast  | keep        |
| sh/key-sequences.spec.md   | ~15   | 146   | acceptance | fast  | keep        |
| sh/keys.spec.md            | ~45   | 444   | acceptance | fast  | keep        |
| sh/mutations.spec.md       | ~17   | 147   | acceptance | fast  | keep        |
| sh/navigation.spec.md      | ~12   | 182   | acceptance | fast  | keep        |
| sh/path-navigation.spec.md | ~20   | 204   | acceptance | fast  | keep        |
| sh/selection.spec.md       | ~10   | 103   | acceptance | fast  | keep        |
| sh/view-controls.spec.md   | ~21   | 209   | acceptance | fast  | keep        |
| sh/views.spec.md           | ~7    | 73    | acceptance | fast  | keep        |

### Top-level mdspec

| File                | Tests | Lines | Type       | Speed | Disposition |
| ------------------- | ----- | ----- | ---------- | ----- | ----------- |
| tests/agent.spec.md | ~17   | 160   | acceptance | fast  | keep        |
| tests/km.spec.md    | ~22   | 275   | acceptance | fast  | keep        |

## Other Packages

### km-core

| File                 | Tests | Lines | Type | Speed | Disposition |
| -------------------- | ----- | ----- | ---- | ----- | ----------- |
| query/date.test.ts   | 33    | 214   | core | fast  | keep        |
| query/parser.test.ts | 46    | 355   | core | fast  | keep        |
| service.test.ts      | 5     | 84    | core | fast  | keep        |
| types.test.ts        | 6     | 32    | core | fast  | keep        |

### km-commands

| File                | Tests | Lines | Type | Speed | Disposition |
| ------------------- | ----- | ----- | ---- | ----- | ----------- |
| commands.test.ts    | 54    | 718   | core | fast  | keep        |
| executor.test.ts    | 25    | 367   | core | fast  | keep        |
| key-adapter.test.ts | 34    | 399   | core | fast  | keep        |
| keybindings.test.ts | 40    | 640   | core | fast  | keep        |
| registry.test.ts    | 31    | 305   | core | fast  | keep        |

### km-agent

| File              | Tests | Lines | Type | Speed | Disposition |
| ----------------- | ----- | ----- | ---- | ----- | ----------- |
| harness.test.ts   | 14    | 109   | core | fast  | keep        |
| mutations.test.ts | 12    | 126   | core | fast  | keep        |
| queries.test.ts   | 16    | 315   | core | fast  | keep        |
| sessions.test.ts  | 1     | 48    | core | fast  | keep        |

### km-beads

| File              | Tests | Lines | Type | Speed | Disposition |
| ----------------- | ----- | ----- | ---- | ----- | ----------- |
| deps.test.ts      | 12    | 248   | core | fast  | keep        |
| mutations.test.ts | 19    | 160   | core | fast  | keep        |
| short-ids.test.ts | 4     | 32    | core | fast  | keep        |

### km-connector-caldav

| File                   | Tests | Lines | Type | Speed | Disposition |
| ---------------------- | ----- | ----- | ---- | ----- | ----------- |
| caldav-client.test.ts  | 13    | 494   | core | fast  | keep        |
| carddav-client.test.ts | 12    | 442   | core | fast  | keep        |
| icalendar.test.ts      | 16    | 295   | core | fast  | keep        |
| vcard.test.ts          | 19    | 321   | core | fast  | keep        |
| webdav-base.test.ts    | 13    | 286   | core | fast  | keep        |

## Vendor Packages

37 test files in vendor packages. These are owned by the vendor submodules:

- silvery/packages/ansi (5 files)
- flexily (1 file)
- silvery (12 files)
- silvery/packages/ui (11 files)
- loggily (2 files)
- Others (6 files)

Disposition: **keep** (owned by vendor, not part of km test review)
