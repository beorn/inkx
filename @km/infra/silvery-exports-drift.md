---
mentions:
  - km
  - Bjørn
id: "@km/infra/silvery-exports-drift"
aliases:
  - km-infra.silvery-exports-drift
  - km-infra-silvery-exports-drift
created_by: Bjørn Stabell
created_at: 2026-04-12T04:29:11Z
closed_at: 2026-04-12T05:52:14Z
close_reason: "Fixed via hybrid restore: every @silvery/* package now declares
  the subpath exports its sibling packages and external apps actually consume
  (publishConfig + tsdown multi-entry), and ag-react/ag-term
  internal-to-internal call sites rewritten to relative paths (240 imports
  across 58 files in ag-react, 42 in ag-term). The pipeline.ts shim rewritten as
  'export * from ./pipeline/index' so both file-resolution and exports-map paths
  work. Vitest alias workaround removed. typecheck baseline regenerated (472
  errors / 55 files, 45 lines smaller than the interim). Verified: test:fast
  6227/0, test:vendor 9244/1pre-existing, all 4 km-8 verification targets green.
  silvery commit 3a42cc3c, km root commit 91d6c030c."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.silvery-exports-drift
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-11T21:29:20Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-infra
---

# [x] v0.17.3 silvery packages narrowed exports to only . — broke vendor test imports @km/infra #bug #P2 @Bjørn Stabell

blocks:: [[@km/infra]]

The coordinated 0.17.3 release of the silvery monorepo narrowed every @silvery/* package.json exports field to only "." for npm publish cleanliness, but the internal source still has ~190 deep cross-package subpath imports (@silvery/ag-term/pipeline/pretext, @silvery/ag-react/hooks/usePositionRegistry, etc.). Vite strictly respects exports, so all vendor tests failed with "Missing specifier" errors.

Worked around in vitest.config.ts by adding a resolver alias for the vendor project that maps @silvery/<pkg>/* → vendor/silvery/packages/<pkg>/src/* (bypasses exports, lets Vite use its native extension resolution for .ts/.tsx).

Partial fix also applied: added explicit/wildcard exports entries to 10 silvery package.json files, but incomplete (ag-react has ~100 tsx files that need enumerating because Vite wildcards don't mix .ts and .tsx extensions).

Proper fix: restore full exports maps across all 10 packages OR change internal source to use only barrel imports from the package root (@silvery/ag-term, not @silvery/ag-term/pipeline/pretext). The second is cleaner and matches the "internal" package design intent.

Blocks clean vendor test runs outside of the workaround alias. Ok as an infra regression bead, not urgent since the alias unblocks work.

