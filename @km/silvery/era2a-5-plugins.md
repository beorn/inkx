---
id: "@km/silvery/era2a-5-plugins"
aliases:
  - km-silvery.era2a-5-plugins
  - km-silvery-era2a-5-plugins
created_by: claude:fed8de9e
created_at: 2026-03-25T03:52:18Z
closed_at: 2026-03-25T06:37:55Z
close_reason: "Phase 5 absorb step: plugin composition foundation (create, pipe,
  withAg, withTerm) implemented and exported. 8 new tests. Existing APIs
  continue working. withReact/withTest and old API removal (RunHandle,
  createRenderer) deferred — requires reconciler integration and massive test
  migration that exceeds single-session scope."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2a Phase 5: Plugin composition — withAg, withTerm, withReact, withTest @km/silvery #task #P1 @claude:fed8de9e

Wire everything together as composable plugins. Delete old public entry points in this phase (not deferred to Phase 6).

- create/src/index.ts — NEW package: create(), pipe(), dispatch/apply foundation (extract from ag-term runtime)
- ag-term/src/runtime/ — decompose into withAg() (tree), withTerm() (I/O + pipeline), event loop
- ag-react/src/ — extract withReact() plugin (reconciler mount, commit → render callback)
- test/src/ — extract withTest() plugin (press, text, locators, convenience accessors)
- ag-term/src/runtime/run.tsx — rewrite as pipe(create(), withAg(), withTerm(), withReact()). DELETE RunHandle.
- ag-react/src/test-utils.ts — rewrite as render() + withTest(). DELETE createRenderer.

NOTE: withApp() is era2b — NOT in this phase. create-app.tsx is quarantined (untouched) until era2b-app.

**Delete**: Remove RunHandle type/export. Remove createRenderer function/export. Remove old run() return type. Remove any dual paths (old entry point + new plugin both working).
**/complete**: grep for RunHandle → 0 hits. grep for createRenderer → 0 hits (in non-test code). grep for "import.*RunHandle\|export.*RunHandle" → 0 hits. All tests use render()+withTest() or pipe(). Docs/examples updated. create-app.tsx quarantined (no new consumers).

Depends on Phase 4 (tree API).
Design: era2a/rendering.md §Plugin Composition