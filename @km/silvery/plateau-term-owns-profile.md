---
mentions:
  - km
  - claude
id: "@km/silvery/plateau-term-owns-profile"
aliases:
  - km-silvery.plateau-term-owns-profile
  - km-silvery-plateau-term-owns-profile
created_by: claude:c6244087
created_at: 2026-04-23T09:49:13Z
closed_at: 2026-04-23T10:22:26Z
close_reason: Shipped in silvery a9f7d010. Every Term variant (Node, headless,
  emulator) now exposes non-optional readonly term.profile, populated via
  createTerminalProfile({caps}) at construction with source='caller-caps'.
  run.tsx Term path consumes term.profile directly — no second
  createTerminalProfile call unless colorLevel override. 3 new contract tests in
  create-term-defaults.contract.test.tsx pin the invariants (262/262 contract
  tests pass, 2552/2552 km-tui+km-logview pass, tsc at baseline 210).
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.plateau-term-owns-profile
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T02:49:50Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Term.profile — Term instances own their resolved TerminalProfile @km/silvery #task #P3 @claude:c6244087

blocks:: [[@km/silvery]]

After Phase 2 made `Term.caps` non-optional, the Term still doesn't own a full `TerminalProfile`. run.tsx's Term path (run.tsx:337-343) constructs a profile from `term.caps` on every run() call — two detection passes, not one.

## Reframe (from /big review 2026-04-23)

The Term should own its profile. Construct it once inside `createNodeTerm` / `createHeadlessTerm` / `createBackendTerm`, cache on `_profile`, expose as `term.profile`.

Then run.tsx's Term path becomes:

```ts
const termProfile = termOptions?.profile ?? term.profile
```

No second `createTerminalProfile` call; no `caps: term.caps` re-pass; no risk of the pipeline and the Term disagreeing about what the Term is.

## Files

- vendor/silvery/packages/ag-term/src/ansi/term.ts — add `_profile` field, expose `term.profile` getter
- vendor/silvery/packages/ag-term/src/runtime/run.tsx — consume `term.profile` directly
- vendor/silvery/packages/ansi/tests/profile.test.ts — contract test: `term.profile` matches `createTerminalProfile({ caps: term.caps })`

## Effort

~30 LOC + docs. Low risk, aligns with the Term-as-provider principle.

From /big review 2026-04-23 (H15 action item).

