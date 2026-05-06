---
mentions:
  - km
id: "@km/silvery/phase-d-console-perf"
aliases:
  - km-silvery.phase-d-console-perf
  - km-silvery-phase-d-console-perf
created_by: claude:019d032d
created_at: 2026-04-23T00:44:24Z
closed_at: 2026-04-23T01:08:10Z
close_reason: "Phase D shipped silvery 47245067 + km 960ce5d15. Console exposes
  count: ReadSignal<number> (cheap notification) + entriesSnapshot() (lazy O(n)
  copy); entries ReadSignal dropped. useConsole + Board + tui all migrated. 39
  console/output tests + 2511 km-tui pass. Closes the P1-9 perf item;
  pro-review-p1 (4/4 items done: A1 name-uniqueness, A2 backendTerm signals, A3
  symbol hiding, D console perf); parent epic term-sub-owners done (all 4 phases
  A/B/C/D + Phase 9b shipped)."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.phase-d-console-perf
    depends_on_id: km-silvery.phase-c-console-router
    type: blocks
    created_at: 2026-04-22T17:44:27Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.phase-d-console-perf
    depends_on_id: km-silvery.pro-review-p1
    type: parent-child
    created_at: 2026-04-22T17:44:25Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.phase-c-console-router
      - type: link
        target: km-silvery.pro-review-p1
---

# [x] Phase D: Console perf — count signal + entriesSnapshot(); drop entries signal @km/silvery #task #P2

blocks:: [[@km/silvery/phase-c-console-router]], [[@km/silvery/pro-review-p1]]

## What changes

- \`packages/ag-term/src/runtime/devices/console.ts\` — replace \`readonly entries: ReadSignal<readonly ConsoleEntry[]>\` with:
  - \`readonly count: ReadSignal<number>\` — increments per captured entry; cheap notification.
  - \`entriesSnapshot(): readonly ConsoleEntry[]\` — explicit method that returns a frozen slice of the current buffer.
- Internal: stop calling \`_entries(Object.freeze(buffer.slice()))\` on every log. Instead \`_count(++count)\`. \`entriesSnapshot()\` slices on demand. Replaces O(n²) with O(n) amortized.
- \`packages/ag-react/src/hooks/useConsole.ts\` — watch \`count\`, call \`entriesSnapshot()\` in the flush timer.
- \`apps/km-tui/src/tui.tsx\` + \`apps/km-tui/src/views/useBoardController.ts\` — call \`entriesSnapshot()\` instead of \`entries()\`.
- \`apps/km-tui/src/views/Board.tsx\` — \`effect(() => patchedConsole.count())\` instead of \`entries()\`.
- Docs: \`docs/api/term-console.md\` updated to describe the new shape.

## Delete

- \`Console.entries: ReadSignal<readonly ConsoleEntry[]>\` public property.
- \`Object.freeze(buffer.slice())\` copy-on-every-log inside \`install()\`.

## /complete grep criteria

- \`grep -rn "\.entries()\|\.entries\b" apps packages vendor/silvery --include='*.ts' --include='*.tsx' | grep -i console | grep -v '/dist/\|node_modules\|\.test\.\|/tests/\|Array'\` returns 0 hits (all consumers migrated to \`entriesSnapshot()\` / \`count()\`)
- \`grep -n "readonly entries:" vendor/silvery/packages/ag-term/src/runtime/devices/console.ts\` returns 0 (removed from interface)
- \`bun vitest run vendor/silvery/tests/features/console.test.ts\` passes
- @km/tui 2511 tests pass
- Benchmark (optional): N=10000 log entries should not show O(n²) time

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

