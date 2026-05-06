---
mentions:
  - km
  - Bjørn
id: "@km/infra/npm-publishing"
aliases:
  - km-infra.npm-publishing
  - km-infra-npm-publishing
created_by: Bjørn Stabell
created_at: 2026-04-11T19:10:33Z
closed_at: 2026-04-11T22:45:59Z
close_reason: All vendor packages published with tsdown + publishConfig pattern.
  npx @silvery/examples works. Smoke tests pass. Cross-dep versions fixed.
  engines.node lowered. Audit tool created (bun infra/audit-packages.ts).
  Remaining work tracked in km-infra.release-workflow.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] npm publishing: bundle all vendor packages for Node.js compatibility @km/infra #task #P1 @Bjørn Stabell

## Goal

Make all vendor packages work reliably for Node.js/npm consumers, with an ergonomic release flow using tsdown + pnpm publish. npx @silvery/examples (and all vendor bins) must work out of the box. Local dev requires zero build step.

## Architecture

### Build: tsdown with workspace mode

- One `tsdown.config.ts` at monorepo root, auto-inherited by all packages
- `tsdown -W` builds all workspace packages; `tsdown -W -F pkg` builds one
- `exports: { devExports: true }` auto-generates:
  - Top-level exports → src/*.ts (for local dev, no build needed)
  - publishConfig.exports → dist/*.js (for npm consumers)
- `dts: true` generates .d.ts declarations
- Built-in `publint` + `attw` validation

### Local dev: zero build step

- Source package.json exports point to src/*.ts
- Bun workspace resolution reads exports, finds src/ files directly
- Works in both km monorepo (via overrides) and silvery standalone (via workspaces)

### Publish: pnpm publish

- publishConfig overrides apply — npm consumers see dist/ exports only
- pnpm required (npm doesn't support publishConfig.exports override)
- pnpm already in workspace Nix flake

### Workspace root pattern

- Every monorepo has a *-project root package.json (private: true)
- Has workspaces, overrides for local resolution
- Published packages live under packages/ or apps/

### Version coordination

- Changesets with fixed groups for @silvery/* — all at same version
- `pnpm changeset` → merge → release PR → CI publish

## Implementation Plan

### Phase 1: Prototype with loggily (single package)

- [ ] Add tsdown.config.ts with exports: { devExports: true }, dts: true
- [ ] Run tsdown, verify dist/ output and package.json rewrite
- [ ] Test: pnpm publish --dry-run from loggily root
- [ ] Test: npm pack, install tarball in temp dir, node -e "import('loggily')"
- [ ] Remove old bun build / vp pack setup if present
- [ ] Verify local dev still works (bun imports resolve to src/)

### Phase 2: Silvery monorepo

- [ ] Restructure: root → silvery-project (private: true)
- [ ] Move silvery barrel into packages/silvery/
- [ ] Add root tsdown.config.ts with workspace mode
- [ ] tsdown -W builds all packages
- [ ] Each package: verify exports auto-generated correctly
- [ ] examples/: bin → dist/cli.js (built by tsdown)
- [ ] Fix stale dependency versions
- [ ] Test: npx @silvery/examples text layout
- [ ] Test: node -e "import('silvery')"
- [ ] Set up Changesets (.changeset/config.json with fixed groups)

### Phase 3: Other vendor packages

- [ ] flexily: add tsdown config
- [ ] termless: evaluate and fix
- [ ] All packages with bin/: verify dist/*.js entry

### Phase 4: CI + release workflows

- [ ] Update silvery release.yml: tsdown -W before pnpm publish
- [ ] Update loggily release.yml
- [ ] Add post-publish smoke test (install from registry, verify import)
- [ ] Changesets CI integration (release PR workflow)

### Phase 5: Steering docs

- [ ] vendor/CLAUDE.md: replace ESM Publishing section with tsdown pattern
- [ ] /release skill: tsdown + pnpm publish + changesets
- [ ] /repo-health skill: check exports/files/bin for new pattern
- [ ] /project-audit skill: npm publishing health checks

## Key decisions

- tsdown for build (not tsup, unbuild, or custom scripts)
- pnpm publish for publishing (not npm — publishConfig.exports support needed)
- Changesets for versioning (not manual, not vp — changesets is the ecosystem standard)
- devExports: true for source/publish split (no custom manifest generation)
- No bun condition in exports, no src/ shipped to npm
- No 'default' in exports — just types + import

