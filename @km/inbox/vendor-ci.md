---
id: "@km/inbox/vendor-ci"
aliases:
  - km-vendor-ci
  - "@km/_orphan/vendor-ci"
created_at: 2026-01-31T08:30:20Z
closed_at: 2026-01-31T11:53:11Z
assignee: claude:227cdc41
---

# [x] Standalone CI for vendor packages (flexx, chalkx, inkx, mdtest) @km/_orphan #feature #P2 @claude:227cdc41

## Summary

Enable core vendor packages to run CI tests independently while still working seamlessly in the km monorepo.

## Problem

Currently vendor packages (flexx, chalkx, inkx, mdtest) can't run standalone CI because:
- They depend on each other via workspace links (e.g., inkx → flexx, chalkx)
- npm registry doesn't have these packages published
- GitHub Actions checks out repos individually without monorepo context

## Proposed Solution

### 1. Publish packages to npm (or use GitHub Packages)

Publish stable versions of:
- `@beorn/flexx`
- `@beorn/chalkx` (or `chalkx`)
- `@beorn/inkx` (or `inkx`)
- `@beorn/mdtest` (or `mdtest`)

### 2. Use npm dependencies in package.json

Each package references dependencies via npm:
```json
{
  "dependencies": {
    "@beorn/flexx": "^0.1.0",
    "@beorn/chalkx": "^0.1.0"
  }
}
```

### 3. Override in km monorepo via workspace protocol

km's root package.json or bun workspace config overrides with local versions:
```json
{
  "overrides": {
    "@beorn/flexx": "workspace:*",
    "@beorn/chalkx": "workspace:*"
  }
}
```

Or via bun workspaces in `bunfig.toml` / workspace package resolution.

## Current State

- **flexx**: No external deps, could run standalone now
- **chalkx**: No external deps, could run standalone now  
- **inkx**: Depends on flexx, chalkx
- **mdtest**: Need to check dependencies

## Verification

km may already have workspace overrides configured. Check:
```bash
grep -r "workspace:" package.json bun.lockb
cat bunfig.toml 2>/dev/null
```

## Tasks

1. [ ] Audit current workspace/override configuration in km
2. [ ] Publish flexx to npm (or GitHub Packages)
3. [ ] Publish chalkx to npm
4. [ ] Update inkx package.json to use npm versions
5. [ ] Restore inkx CI workflow with proper deps
6. [ ] Update mdtest similarly
7. [ ] Document the dual-resolution pattern

## Notes

This enables:
- Independent CI for each package
- Easier external adoption (people can npm install)
- Clear versioning and releases
- Monorepo still uses local development versions