---
id: "@km/infra/linter"
aliases:
  - km-infra.linter
  - km-infra-linter
created_at: 2026-02-04T11:27:37Z
closed_at: 2026-02-04T13:54:30Z
---

# [x] Standardize on Biome or ESLint+Prettier across monorepo @km/infra #task #P4 @claude:9e69175d

Currently the monorepo uses two different linting setups:

**Main km project**: ESLint + Prettier
- Type-aware linting with typescript-eslint
- Promise plugin for async rules

**vendor/beorn-inkx**: Biome
- Faster, single-tool setup
- Different style (tabs vs spaces, etc.)

**Decision needed:**
1. Standardize on ESLint+Prettier everywhere (better type-aware rules)
2. Standardize on Biome everywhere (faster, simpler)
3. Keep split (main = ESLint, vendors = Biome)

**Considerations:**
- Type-aware rules like no-floating-promises are valuable
- Biome may add type-aware support in future
- Vendor packages may have their own preferences