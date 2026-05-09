---
aliases:
  - km-infra.cold-clone-build-artifacts
  - km-infra-cold-clone-build-artifacts
created_at: 2026-05-09T01:30:57.692Z
---

# cold-clone build artifacts missing — 2 typecheck errors block test:fast in fresh worktrees #chore #P3

## Symptom

Fresh worktrees (`bun worktree create wtN`) fail `bun run test:fast` at the typecheck gate with 2 errors that don't appear in the main repo's working tree:

```
vendor/termless/packages/libvterm/src/wasm-bindings.ts(57,52): error TS2307:
  Cannot find module '../wasm/libvterm.js' or its corresponding type declarations.

../km/vendor/silvery/packages/test/src/index.tsx(146,1): error TS2578:
  Unused '@ts-expect-error' directive.
```

Both vendor submodules are at the same SHA in main and the worktree.

## Root cause

- `vendor/termless/packages/libvterm/wasm/libvterm.js` is `.gitignore`d (build artifact from `make wasm`); main has it from a prior build, fresh checkouts don't.
- `@ts-expect-error` "unused" — types resolve differently between main and the worktree, probably because main has `.d.ts` artifacts somewhere in the type-resolution path that the cold checkout lacks.

## Options

1. Add the wasm build to `bun worktree create` post-setup (or to `bun install` postinstall in vendor/termless).
2. Add the two errors to `packages/km-infra/scripts/typecheck/baseline.txt` so cold worktrees pass the gate (current baseline has 0 entries; adding 2 baseline-acknowledged errors is fine if the alternative is "developer must remember to build wasm before test:fast").
3. Skip / `@ts-ignore` the unused-directive in silvery's test/src/index.tsx so it doesn't depend on artifact presence.

## Acceptance

- `bun worktree create <name>` followed by `cd ../km-<name> && bun run test:fast` passes the typecheck gate (or the gate documents what it expects).
- No regression for the main repo's typecheck output.

## Provenance

Surfaced during chief's `test:fast` triage assignment (slot @agent/0). Not a session regression — pre-existing build-hygiene gap. Filed at chief's request.
