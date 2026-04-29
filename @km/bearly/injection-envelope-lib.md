---
id: "@km/bearly/injection-envelope-lib"
aliases:
  - km-bearly.injection-envelope-lib
  - km-bearly-injection-envelope-lib
created_by: claude:7e9436e8
created_at: 2026-04-21T19:41:25Z
closed_at: 2026-04-21T20:04:27Z
close_reason: "Phase 2 complete. Library at
  vendor/bearly/plugins/injection-envelope/ (46 tests). bearly/inject-core.ts +
  accountly/recall.ts both route through it. CI lint
  tools/lint-injection-emitters.ts wired into bun fix + test:ci. Commits: bearly
  c656387, km root 5f5b96b73. Dep-free (0 externals)."
owner: bjorn@stabell.org
assignee: claude:7e9436e8
dependencies:
  - issue_id: km-bearly.injection-envelope-lib
    depends_on_id: km-bearly
    type: parent-child
    created_at: 2026-04-21T12:41:25Z
    created_by: claude:7e9436e8
    metadata: "{}"
---

# [x] Extract shared @bearly/injection-envelope library @km/bearly #task #P0 @claude:7e9436e8

blocks:: [[@km/bearly]]

# Phase 2 of @km/_orphan/ambot fix

Extract the injection-framing primitives (CONTEXT_PROTOCOL_FOOTER, IMPERATIVE_VERBS, rewriteImperativeAsReported, hardened wrapper builder, sanitizer) into a shared package.

## What ships

- New package: `vendor/bearly/plugins/injection-envelope/` (publishable as `@bearly/injection-envelope`)
- Public API:
  ```ts
  wrapInjectedContext({ source: 'qmd' | 'recall' | 'tribe' | …, snippets: Snippet[], trust?: 'reference' | 'untrusted-reference' }) → string
  rewriteImperativeAsReported(text: string): string
  sanitize(text: string, maxLen: number): string
  CONTEXT_PROTOCOL_FOOTER: string
  emitHookJson(eventName, additionalContext?) → string
  RegisteredSource: type union of all allowed source values
  ```
- Registry: `RegisteredSource` type in registry.ts enumerates allowed source values; unknown sources fail at compile-time
- CI lint: `bun tools/lint-injection-emitters.ts` greps for raw `additionalContext` emission outside the library; fails CI
- Migration: vendor/bearly/plugins/recall/src/lib/inject-core.ts + vendor/accountly/src/recall.ts both import from library; delete duct-tape copies

## Acceptance

- [ ] Library exists, typechecks, tests pass
- [ ] bearly + accountly both route through it (grep for CONTEXT_PROTOCOL_FOOTER shows only one definition)
- [ ] CI lint catches raw additionalContext attempts in test fixture
- [ ] Existing functional tests still pass for both paths
- [ ] No duplicate imperative verb lists