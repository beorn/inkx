---
mentions:
  - km
id: "@km/inbox/version"
aliases:
  - km-version
  - "@km/_orphan/version"
created_at: 2026-01-23T10:13:07Z
closed_at: 2026-01-23T10:27:47Z
---

# [x] Add release system with version info and -V support (cloudi pattern) @km/_orphan #feature #P2

## Summary

Add build-time version generation so `bun km -V` works and version info is available at runtime.

## Phase 1: Documentation (do first)

Update docs so new code follows the pattern:

### CLAUDE.md

Add to §12 (Debug Logging) or new section:

- VERSION comes from `@km/core`, never hardcode
- Use `BUILD_INFO` for git commit/branch in diagnostics

### docs/dev/versioning.md (new)

Document the version system:

- Single source of truth: package.json
- Build-time generation via `bun run build:info`
- How to bump version (update package.json, run build:info)

## Phase 2: Implementation

### Files to Create

**scripts/generate-build-info.ts**
Copy and adapt from cloudi (`../cloudi/scripts/generate-build-info.ts`):

- Read version from `package.json`
- Get git commit (7 chars), branch, dirty state
- Output to `packages/km-core/src/build-info.gen.ts`

**packages/@km/_orphan/core/src/build-info.gen.ts** (generated)

```typescript
export const VERSION = "0.1.0"
export const GIT_COMMIT = "5197ef0"
export const GIT_BRANCH = "main"
export const GIT_DIRTY = false
export const BUILD_TIME = "2026-01-23T10:00:00.000Z"
export const BUILD_INFO: BuildInfo = { ... }
```

### Files to Modify

**packages/@km/_orphan/core/src/index.ts** — Add export:

```typescript
export { VERSION, BUILD_INFO, type BuildInfo } from "./build-info.gen.ts"
```

**apps/@km/_orphan/cli/src/index.ts** (line 66) — Change hardcoded version:

```typescript
import { VERSION } from "@km/core"
// ...
.version(VERSION)
```

**package.json** — Add scripts:

```json
"build:info": "bun scripts/generate-build-info.ts",
"prebuild": "bun run build:info"
```

**.gitignore** — Add:

```
*.gen.ts
```

## Verification

```bash
bun run build:info                           # Generate
cat packages/km-core/src/build-info.gen.ts   # Verify created
bun km -V                                     # Should print: 0.1.0
bun km --version                              # Same
```

## Acceptance Criteria

- [ ] CLAUDE.md updated with version pattern
- [ ] docs/dev/versioning.md created
- [ ] `bun km -V` prints version
- [ ] Version comes from package.json (not hardcoded)
- [ ] BUILD_INFO available for diagnostics
- [ ] build-info.gen.ts is gitignored

