# useBoxRect / useScrollRect / useScreenRect — caller audit

**Phase 1 of `km-silvery.view-as-layout-output` (deep scope, ~1 week pre-TEA).**

Generated 2026-04-25 from `grep -rEn "use(Box|Scroll|Screen)Rect\(" apps/ vendor/silvery/`. Excludes test files, dist artifacts, and docstring references — only actual call sites.

## Classification

Each caller is one of:

- **(a) flex-prop replaceable** — the rect is read to compute width/height for content sizing that flex/CSS could express. Migration: declare via flex props (`flexGrow`, `width`, `wrap="wrap"`, etc.); delete the read.
- **(b) callback form / ref + onLayout** — already correct (callback fires AFTER layout, no stale-read class). No migration needed unless the consumer can switch to props entirely.
- **(c) genuinely needs reactive dimension at render time** — the consumer can't be expressed via flex props (e.g., a TextArea that needs to know exact width to wrap programmatically). Keep with documented caveat about first-frame zero-read.

After the migration, **(a)** sites become props, **(b)** sites stay as-is, and **(c)** sites get an explicit `// LAYOUT_READ_AT_RENDER: <reason>` comment + a lint rule that warns on any new reactive calls.

## Reactive callers (read at render time)

| File:Line | Caller | Read | Class | Migration |
|---|---|---|---|---|
| `apps/km-tui/src/views/InlineEditField.tsx:50` | InlineEditField | `width` | (a) | Replace with `<Text wrap="wrap">` parent flex; the text input already has CSS-equivalent control |
| `apps/km-tui/src/views/BodyEditField.tsx:39` | BodyEditField | `width` | (a) | Same as InlineEditField |
| `apps/km-tui/src/views/BoardView.tsx:359` | BoardView | `parentRect` (full) | (c) | BoardView's column layout depends on actual pane pixel width — keep with caveat. Could potentially move to layout-signals if the column sizing logic moves into the layout phase |
| `apps/km-tui/src/views/useBoardController.ts:564` | useBoardController | `paneRect` | (c) | Same as BoardView — pane width drives column count |
| `apps/silvercode/src/components/MessageList.tsx:103` | MessageList | `height` | (a/c) | **Phase 3 of the bead — ListView height-independence.** Rewrite ListView to drop the height prop; use `flex-grow=1 overflow=scroll` + index-window virtualization. `useBoxRect` call disappears |
| `apps/silvercode/src/components/CommandBox.tsx:194` | CommandBox | `width: contentWidth` | (a) | Likely for the inline TextArea wrap. If TextArea handles its own width via flex, delete this read |
| `apps/silvercode/src/components/PaneGrid.tsx:87` | PaneGrid | `gridRect` | (b) | Already mostly callback-shaped (used for drag-resize math); could move to ref+onLayout if the read isn't reactive-required |
| `vendor/silvery/packages/ag-react/src/ui/components/ProgressBar.tsx:63` | ProgressBar | `layoutRect` | (a) | Progress bar width can be a `width` prop or filled via flex |
| `vendor/silvery/packages/ag-react/src/ui/components/Divider.tsx:47` | Divider | `width: contentWidth` | (a) | Divider can flex-grow to fill instead of measuring |
| `vendor/silvery/packages/ag-react/src/ui/components/TextArea.tsx:160` | TextArea | `width: parentWidth` | (c) | Canonical text input — needs width for word-wrap math. Document as the primary (c) caller; everyone else routes through this |
| `vendor/silvery/packages/ag-react/src/ui/image/Image.tsx:102` | Image | `boxRect` | (c) | Image fit needs actual cell dimensions |

## Callback callers (post-layout register — already correct)

These fire AFTER layout completes via `useBoxRect((rect) => …)` or `useScrollRect((rect) => …)`. No stale-read class; no migration needed.

| File:Line | Hook | Purpose |
|---|---|---|
| `apps/km-tui/src/views/shared-components.tsx:175` | `useBoxRect(handleLayout)` | Card layout registration |
| `apps/km-tui/src/views/CardColumn.tsx:231` | `useScrollRect(handleLayout)` | Column scroll-position registration |
| `apps/km-tui/src/views/CardColumn.tsx:256` | `useScrollRect((rect) => …)` | Column-card position registration |
| `apps/km-tui/src/views/DetailView.tsx:81` | `useScrollRect((rect) => …)` | Detail pane scroll-anchor registration |
| `apps/km-tui/src/views/TreeNode.tsx:1052` | `useScrollRect((rect) => callbackRef.current(rect))` | TreeNode head-row position |
| `vendor/silvery/packages/ag-react/src/hooks/useCursor.ts:203` | `useScrollRect(useCallback((rect) => …))` | **Internal — Phase 2 deletes this entirely (cursor as layout output)** |
| `vendor/silvery/packages/ag-react/src/hooks/useGridPosition.ts:36` | `useScrollRect((rect) => …)` | Grid-position lookup |

## Migration plan summary

| Class | Count | Phase |
|---|---|---|
| (a) flex-prop replaceable | 6 | Phase 5 (sweep) |
| (b) callback form / ref+onLayout | 7 | No migration — already correct |
| (c) genuinely reactive | 4 (BoardView, useBoardController, TextArea, Image) | Phase 5 — document with caveats |
| Internal hook (`useCursor` body) | 1 | Phase 2 (cursor as layout output — deleted) |
| ListView height-dependence | 1 (MessageList → ListView) | Phase 3 (ListView height-independence) |

**Net Phase 5 work**: ~6 reactive calls become props; ~4 stay as documented `(c)` cases. ~7 callback forms left untouched.

## Sites NOT in this audit

- `useScreenRect()` — no current callers; it's exported but the codebase uses `useScrollRect` instead. Same migration story applies.
- `measureElement()` — Ink-compat shim; explicitly `@deprecated` in favor of `useBoxRect`. Will fold into the migration.
- `boxHandleRef.current?.getBoxRect()` style imperative reads via Box ref — these are the canonical `(b)` pattern (post-mount, no stale-read). Sites in `vendor/silvery/packages/ag-react/src/ui/components/ListView.tsx:1094-1097` etc.

## References

- Bead: `km-silvery.view-as-layout-output` (P1, pre-TEA, deep scope)
- Tracking: `km-silvery.architectural-plateau`
- Failing regression tests already pinning the bug class:
  - `vendor/silvery/tests/features/cursor-conditional-mount.test.tsx` (cursor)
  - `apps/silvercode/tests/visual/message-wrap-truncation.test.tsx` (wrap via ListView)
