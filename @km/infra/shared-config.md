---
id: "@km/infra/shared-config"
aliases:
  - km-infra.shared-config
  - km-infra-shared-config
created_at: 2026-02-04T11:27:36Z
closed_at: 2026-02-11T16:45:41Z
---

# [x] Create @beorn/monorepo shared config package @km/infra #feature #P4

Create a shared monorepo configuration package that standardizes tooling across all @beorn/* packages.

## Motivation
Currently each vendor package (inkx, chalkx, flexx, etc.) has its own formatting/linting config, leading to inconsistent code style. inkx uses Biome with semicolons/tabs, while km uses Prettier without semicolons/spaces.

## Scope
- Shared Prettier or Biome config
- Shared ESLint config (or Biome linter rules)
- Shared TypeScript base config
- Possibly shared Vitest config

## Considerations
- Should this be a new repo or part of km?
- Biome vs Prettier decision (Biome is faster, combines lint+format)
- How to handle packages that are also standalone repos (submodules)