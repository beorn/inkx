---
id: "@km/silvery/editcontext-export"
aliases:
  - km-silvery.editcontext-export
  - km-silvery-editcontext-export
created_by: claude:cc081a9a
created_at: 2026-04-26T23:21:23Z
closed_at: 2026-04-27T00:03:59Z
close_reason: >-
  Fixed: added missing dev exports for ui/components subpaths in
  vendor/silvery/packages/ag-react/package.json — CursorLine,
  EditContextDisplay, TextArea, useTextArea. The publishConfig.exports +
  tsdown.entry already listed these; only the dev `exports` field was missing
  them, and the wildcard fallback `./*: ./src/*.ts` doesn't match `.tsx` files.


  Verification:

  - bun vitest run --project vendor
  vendor/silvery/tests/features/click-to-position.test.tsx → 26 passed (the
  previously failing suite)


  Out of scope: 4 use-ag-node.test.tsx failures (lines 16, 69, 106, 171) are
  independent layout/signal bugs unrelated to the export — they are pre-existing
  failures listed in parent epic km-all.fix-sweep-vendor-fuzz. Bead
  description's framing of these as one cluster was incorrect.


  Commits:

  - silvery main: dfa27c08 fix(ag-react): add missing dev exports for
  ui/components subpaths

  - km main: 148f57902 chore(vendor): bump silvery — fix(ag-react) missing dev
  exports for ui/components subpaths
started_at: 2026-04-26T23:23:48Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.editcontext-export
    depends_on_id: km-all.fix-sweep-vendor-fuzz
    type: parent-child
    created_at: 2026-04-26T16:22:34Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] @silvery/ag-react/ui/components/EditContextDisplay missing export — 4 test failures @km/silvery #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-vendor-fuzz]]

click-to-position.test.tsx + use-ag-node.test.tsx (3) fail with: Cannot find package '@silvery/ag-react/ui/components/EditContextDisplay'. Likely export-map issue in vendor/silvery/packages/ag-react/package.json or removed/renamed component. /complete: bun vitest run --project vendor vendor/silvery/tests/features/click-to-position.test.tsx vendor/silvery/tests/features/use-ag-node.test.tsx → 0 failures.