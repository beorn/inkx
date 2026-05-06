---
mentions:
  - silvery
  - km
  - Bjørn
id: "@km/silvery/tea-gap-tsx-subpath"
aliases:
  - km-silvery.tea-gap-tsx-subpath
  - km-silvery-tea-gap-tsx-subpath
created_by: Bjørn Stabell
created_at: 2026-04-18T19:01:23Z
closed_at: 2026-04-19T05:27:46Z
close_reason: "Landed as 7161d643 on silvery main. Added explicit './create-app'
  and './create-app-context' entries to @silvery/create exports (dev-time and
  publishConfig) ahead of the './*': './src/*.ts' wildcard. Also added
  create-app-context to tsdown entries. New tests/exports.test.ts imports every
  declared subpath (11 tests) and catches regressions where a new .tsx module
  lacks an explicit export entry. All 128 create tests pass."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.tea-gap-tsx-subpath
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-18T12:01:49Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [x] TEA gap: @silvery/create/* subpath doesn't resolve .tsx files (create-app.tsx) @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/tea]]

Discovered while executing the aichat-v2 spike (@km/silvery/tea-aichat).

## Problem

vendor/silvery/packages/create/package.json exports:

"exports": {
    ".": "./src/index.ts",
    "./core": "./src/core/index.ts",
    ...
    "./*": "./src/*.ts"
  }

The wildcard only resolves `.ts` files. But `src/create-app.tsx` is a .tsx
file (contains JSX). So `import { createApp } from "@silvery/create/create-app"`
fails with:

Cannot find package '@silvery/create/create-app' imported from ...

The main barrel `@silvery/create` DOES export createApp, so callers can
use the barrel. But the subpath shape implied by "./*" is a trap — the
aichat-v2 shims broke after the silvery-internal absorption and the
prototype sat with dead imports for two weeks before discovery.

## Proposed fix

Either:

(a) Add a second wildcard pattern: `"./*": "./src/*.tsx"`. Node's
    resolution tries both — but behavior across bun/tsc/vite varies.
(b) Rename `create-app.tsx` to `create-app.ts` (eject JSX from that file —
    it's already mostly a re-export per the current content).
(c) Add an explicit export entry:
    `"./create-app": "./src/create-app.tsx"` and document that the
    wildcard only covers .ts files.

(c) is safest. (b) is cleanest if JSX can be eliminated.

## Seen in

hub/silvery/prototype/aichat-v2/shims/app.ts line 23 — caught when the
prototype test suite was resurrected and the stale import surfaced.

## Related

On feat/tea-apply-chain-types branch, the publishConfig adds an
explicit "./create-app" entry (approach c). The main branch package.json
hasn't been updated.

## Effort

Tiny (one line in package.json).

