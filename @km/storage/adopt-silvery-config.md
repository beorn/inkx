---
id: "@km/storage/adopt-silvery-config"
aliases:
  - km-storage.adopt-silvery-config
  - km-storage-adopt-silvery-config
created_by: claude:4de4a3ab
created_at: 2026-04-26T23:04:52Z
closed_at: 2026-04-26T23:23:32Z
close_reason: "Shipped at 3fb69fdfe (silvercode zero-config) + 8057ee61c (km-cli
  adopt). Zero-config: autoResolveAccount + preflightCredentials in
  resolve-connection.ts; 8 new tests in zero-config.test.ts; 16/16 pass. Storage
  adopt: hybrid (sync internal + async app boundary) — bd-load-config.ts
  adapter, 17 call sites switched, cosmiconfig dep dropped from km-storage. 8035
  tests pass overall. Architectural deviation from pure spec (sync constraint)
  documented in commit body. Follow-ups: 'km config' top-level subcommand via
  mountConfigCommand needs a KmKind schema (separate bead if pursued);
  getFolderIndexConfig + getCollapseParseConfig stay sync."
---

# [x] km/km-cli adopt @silvery/config — replace @km/storage's loadConfigObject + cosmiconfig wrapper @km/storage #task #P3 @claude:4de4a3ab

blocks:: [[@km/silvery/config-package]], [[@km/storage]]

silvercode adopted `@silvery/config` (bead `km-silvercode.connection-system`); km still uses its own loader at `packages/km-storage/src/config.ts` (cosmiconfig wrapper exposing `loadConfigObject`). Two parallel implementations of the same concept — they read the same `.km/config.yaml`, but with different APIs and different feature sets (km's is sync, no signals, no scoped writes, no watch).

**Scope**:
- Replace `loadConfigObject(repoRoot)` calls in `apps/km-cli/src/commands/{bd,view,import,…}.ts` with `loadConfig({ appName: "km", cwd: repoRoot })` from @silvery/config
- Migrate `.beads/config.yaml` reads (separate from main config) — decide if it stays standalone or becomes a sub-section
- Mount `km config` subcommand via `mountConfigCommand` for symmetry with `silvercode config`
- Drop `packages/km-storage/src/config.ts`'s cosmiconfig wrapper; the new package handles it

**Acceptance**:
- `rg "loadConfigObject" apps packages` → 0 hits (or ≤ thin compat layer)
- `rg "from \"@km/storage\"" | rg "loadConfig"` → 0 hits
- `km config ai.acp.foo=bar` works (after merge with silvercode's schema)
- All @km/_orphan/cli tests pass

**Why P3**: not regression — km has worked this way all along. Just architectural cleanup. Block other bead deferred.

Depends on: @km/silvery/config-package (shipped); @km/silvercode/connection-system (in flight)