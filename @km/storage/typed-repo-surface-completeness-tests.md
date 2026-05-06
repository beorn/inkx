---
mentions:
  - km
id: "@km/storage/typed-repo-surface-completeness-tests"
aliases:
  - km-storage.typed-repo-surface-completeness-tests
  - km-storage-typed-repo-surface-completeness-tests
created_by: claude:f9eb64dc
created_at: 2026-05-05T22:42:00Z
type: task
priority: P3
status: todo
parent: km-storage
_stub: true
closeReason: "Shipped at 32fb5b1dc. Added
  packages/km-storage/tests/repo/typed-surface.test.ts with 11 compile-time pins
  covering: Repo/SyncableRepo no-emitter, Repo required fields, SyncableRepo
  minimal shape, getRepoEmitter/hasRepoEmitter exact signatures,
  withSync(emitter, config?) arity (L4 plateau invariant — emitter is FIRST
  positional), withFsWriter(repo, emitter) shape, and Repo.apply/commit
  signatures. Pattern B (conditional-type Assert<>) matches the existing
  repo-emitter-not-public.test.ts style. Also documented the surface-change
  protocol in packages/km-storage/CLAUDE.md. Sanity-verified by temporarily
  flipping getRepoEmitter to return Emitter | undefined → tsc errored as
  expected; reverted. Tests: 18 pass (10 new + 8 from companion file)."
---

The `df353f2c7` SyncConfig migration shipped `repo-emitter-not-public.test.ts` which pins one specific invariant: `"emitter" extends keyof Repo` is `false`. That works.

But there are other interfaces (`SyncableRepo`, the export of `getRepoEmitter`/`hasRepoEmitter`, the `withSync(emitter, config)` arity contract) that should also be pinned. The next "let's just expose emitter on Repo for convenience" attempt would be caught by `repo-emitter-not-public.test.ts` — but the next "let's add a private field that bypasses the WeakMap" or "let's make withSync take a config object with `emitter` as a field again" attempt wouldn't.

## Goal

A small typed-completeness test file that pins the entire public surface contract:

- `Repo` type does NOT have `emitter`
- `SyncableRepo` type does NOT have `emitter`
- `getRepoEmitter` is exported from `@km/storage` and takes `Repo`, returns `Emitter` (not optional)
- `hasRepoEmitter` is exported from `@km/storage` and takes `Repo`, returns `boolean`
- `withSync` signature is `(emitter: Emitter, config?: SyncConfig) => (repo) => SyncManager`
- `withFsWriter` signature includes `emitter` as second positional arg

### Implementation

Use TS `expectTypeOf` (vitest types) or a simple `type Test = X extends Y ? true : never` trick. One file in `packages/km-storage/tests/repo/typed-surface.test.ts`. Maybe 30 lines.

### Acceptance

- [ ] Test file exists and runs as part of `bun vitest run packages/km-storage/tests/repo/`
- [ ] Each invariant is a compile-time check (failure = TS error, not runtime)
- [ ] Adding a new public field to Repo / SyncableRepo without updating the test = test failure
- [ ] Documented in `packages/km-storage/CLAUDE.md` (if it exists) as the protocol for surface changes

### Why P3

It's plumbing for the plumbing. Real correctness today (df353f2c7 shipped + repo-emitter-not-public.test.ts pinned). This is preventive — a hardening pass to ensure future drift gets caught at compile time.

### Surfaced by

The /complete pass after the L4 emitter migration. The `sync-legacy-cleanup` 2026-04-03 close was premature because the verification was a grep, not a typed invariant. This bead encodes the lesson.

