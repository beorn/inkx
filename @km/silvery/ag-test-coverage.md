---
id: "@km/silvery/ag-test-coverage"
aliases:
  - km-silvery.ag-test-coverage
  - km-silvery-ag-test-coverage
created_by: Bjørn Stabell
created_at: 2026-04-10T23:02:53Z
closed_at: 2026-04-16T05:54:38Z
close_reason: "54 tests added across 4 files: input-layer (22), paste-callback
  (14), use-exit (6), pipeline-input-stages (12). All passing. Committed to
  silvery main (315c038d), km main (60e91f94)."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Pipeline test coverage — usePaste, useExit, useInputLayer, stage behavior @km/silvery #task #P0 @Bjørn Stabell

Add test coverage for:
1. usePaste hook (simple callback + rich PasteEvent modes)
2. useExit hook
3. useInputLayer hook (layered input with bubbling)
4. Pipeline stage behavior — verify Stage 3 bridges ALL events before filtering, hooks filter correctly, etc.

Goal: test suite proves the documented 5-stage pipeline behavior to any reader.