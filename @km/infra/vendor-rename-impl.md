---
id: "@km/infra/vendor-rename-impl"
aliases:
  - km-infra.vendor-rename-impl
  - km-infra-vendor-rename-impl
created_by: claude:a68f8191
created_at: 2026-02-17T10:22:01Z
closed_at: 2026-03-09T22:07:20Z
close_reason: "Grooming: vendor rename already executed (silvery migration complete)"
owner: bjorn@stabell.org
---

# [x] Vendor rename: execute rename across monorepo @km/infra #task #P4

Execute the vendor rename across the monorepo.

## Completed
- [x] inkx → @hightea/term (package name + 308 consumer imports)
- [x] chalkx → @hightea/chalk (package name + 23 consumer imports)
- [x] @beorn/flexx → flexture (package name + 8 consumer imports)
- [x] themex → swatch (package name + 7 consumer imports)
- [x] @beorn/logger → decant (package name + 69 consumer imports)
- [x] Created @hightea/core package (thin re-export of core/store/tea/react subpaths)
- [x] Updated root package.json overrides + workspace paths
- [x] Updated all consumer package.json dependencies
- [x] Rebuilt bun.lock
- [x] All 4215 tests pass (164 files), 7321 vendor tests pass (305 files)

## Remaining
- [ ] npm org create hightea
- [ ] Set up publishConfig for all packages
- [ ] Publish to npm
- [ ] Rename GitHub repos
- [ ] Update CLAUDE.md files and docs
- [ ] Clean up internal inkx string references (logger namespaces, error messages)