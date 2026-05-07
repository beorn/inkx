---
id: "@km/storage/loadRepo-internalize"
type: refactor
priority: P3
created_at: 2026-05-06T00:00:00.000Z
parent: "@km/all/L5-deprecation-purge"
---

# [ ] km-storage: internalize loadRepo (delete @deprecated, drop public export) (L5 Phase 5d follow-up) #refactor #P3

`loadRepo` in `packages/km-storage/src/repo/loader.ts` is marked `@deprecated` with the suggested replacement `createRepo()`, but it is NOT a shim — it's the actual workhorse generator that `createRepo`'s `initWithFileLoading` delegates to internally (`packages/km-storage/src/repo/repo.ts:1877` with an explicit `eslint-disable @typescript-eslint/no-deprecated -- Internal use of loadRepo is acceptable here`).

13 storage-package test files use `loadRepo` directly to drive the loader pipeline with their own injected `db` for isolation tests (27 invocations).

## Why this is its own bead

L5 Phase 5d brief said "delete the deprecated symbol, fix breaks." That works for true shims. `loadRepo` is structurally load-bearing — deleting it would require:

1. Inlining ~200 lines of generator body into `initWithFileLoading` (or extracting a new internal-only helper)
2. Migrating 13 storage test files that depend on `loadRepo`'s db-injection contract

This is a non-trivial structural change, not a deprecation purge. Per the L5 brief: "If a micro-phase reveals a non-trivial dependency... STOP and report — don't make up the API."

## Acceptance

Two paths — pick one:

**Path A — Internalize without removing**: drop the `export` keyword, rename to `_loadRepoInternal` or place in a `./_internal` subpath. Update test files to use the internal import. Remove `@deprecated` (no longer aspirational — it's the canonical inner). The `eslint-disable` in `repo.ts` becomes unnecessary.

**Path B — Eliminate**: refactor `initWithFileLoading` to absorb the loader generator's body, so there's no separate `loadRepo` symbol. Migrate 13 test files to either use `createRepo` or a new test-only loader factory. Heavier but reaches the "one concept" plateau.

Path A is the realistic 1-session path; Path B is the proper L5 plateau.

## Why deferred

L5 Phase 5d brief explicitly authorized stopping when a "non-trivial dependency" is revealed (the test-file integration). 13 test files + the inner-call site is structural, not a deprecation rename.

