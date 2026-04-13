# Monorepo Infrastructure Package

Centralize tool configuration out of the monorepo root into a reusable `@km/infra` package.

## Vision: XDG for Monorepos

Like the [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) standardizes config locations on Unix (`~/.config`, `~/.cache`, etc.), we want a **convention-based standard for monorepo tooling**:

- **Standard locations** - Tools auto-discover configs from predictable paths
- **Zero boilerplate** - No per-tool config files in repo root
- **Composable** - Override when needed, inherit sensible defaults
- **Tool-agnostic** - Works with any tool that supports config discovery

## Goals

1. **Minimize repo root config files** - Single-line imports instead of verbose configs
2. **Auto-discovery** - Detect workspace structure, frameworks, patterns automatically
3. **Consistent defaults** - Shared quality standards across all packages
4. **Override-friendly** - Easy to customize when needed

## Non-Goals

- The `km` CLI should not provide build/test tooling (keep concerns separate)
- No magic that can't be understood or debugged

## Current State

Config files in repo root:

- `vitest.config.ts` - test runner config with plugins
- `eslint.config.js` - linting rules
- `tsconfig.json` - TypeScript base config
- `prettier.config.js` - formatting (if exists)
- `package.json` scripts - test commands

Quality enforcement:

- `tests/fail-on-console.ts` - bun:test output enforcement
- `tests/vitest-setup.ts` - vitest output enforcement

## Proposed Structure

```
packages/km-infra/
├── vitest/
│   ├── config.ts       # createVitestConfig() factory
│   ├── setup.ts        # test quality enforcement
│   └── plugins/
│       └── mdspec.ts   # .spec.md support (or re-export from mdspec)
├── eslint/
│   └── config.ts       # flat config preset
├── typescript/
│   ├── base.json       # shared compiler options
│   └── paths.ts        # auto-generate paths from workspaces
├── prettier/
│   └── config.ts       # formatting preset
└── index.ts
```

## Usage Examples

### Vitest (single line)

```ts
// vitest.config.ts
export { default } from "@km/infra/vitest"
```

### Vitest (with overrides)

```ts
// vitest.config.ts
import { createVitestConfig } from "@km/infra/vitest"

export default createVitestConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
})
```

### ESLint

```js
// eslint.config.js
export { default } from "@km/infra/eslint"
```

### TypeScript

```json
// tsconfig.json
{
  "extends": "@km/infra/typescript/base.json"
}
```

## Auto-Discovery Features

The infra package should auto-detect:

1. **Workspace packages** - Read `package.json` workspaces, generate TypeScript paths
2. **Framework detection** - React, Ink, Node.js - configure appropriately
3. **Test file patterns** - `.test.ts`, `.spec.md`, `.spec.ts`
4. **Source structure** - `src/`, `tests/`, `packages/`

## Quality Enforcement

Tests must be silent on success:

- Fail on any console.log/warn/error
- Fail on any stdout/stderr output
- Fail on Node.js warnings (MaxListenersExceeded, etc.)
- Disable TTY detection to prevent spinners

Shell execution:

- Set `TERM=dumb` to prevent escape sequences
- Capture and validate subprocess output

## Custom Vitest Reporter

The built-in dot reporter has a bug (empty color sequences). We implement our own:

**Location**: `packages/km-infra/scripts/vitest-reporter.ts` (proposed)

**Features**:

1. Clean dot output (no color bugs)
2. Test performance tracking per-test
3. Slow test detection and reporting
4. JSON export for performance trending
5. Configurable slow threshold

**Usage**:

```ts
// vitest.config.ts
import KmReporter from "@km/infra/vitest-reporter"

export default defineConfig({
  test: {
    reporters: [new KmReporter({ slowThreshold: 100, showSlow: true })],
  },
})
```

**Output example**:

```
····x···-·····················

Tests: 1 failed, 28 passed, 1 skipped, 30 total
Time:  1.23s

Slow tests (>100ms):
     412ms apps/km-cli/tests/sh > $ km sync
     389ms apps/km-cli/tests/sh > $ km init
```

**Bead**: km-test-perf

## Research: How Far Can We Push It?

### Vitest (best support)

From [Vitest 3.x Projects](https://vitest.dev/guide/projects):

- `projects` config replaces deprecated `workspace`
- `extends: true` inherits root config in project configs
- Root config controls global options (reporters, coverage)
- Can define `setupFiles` in root, shared via `extends: true`

**Maximum automation:**

```ts
// Root vitest.config.ts - discovers all packages automatically
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts"],
    setupFiles: ["./infra/vitest-setup.ts"],
  },
})
```

### ESLint (good support)

From [ESLint flat config in monorepos](https://github.com/eslint/eslint/discussions/16960):

- Flat config = single root `eslint.config.js`
- Shareable configs are just npm packages exporting arrays
- `project: true` in typescript-eslint finds nearest `tsconfig.json`

**Maximum automation:**

```js
// Single file, everything auto-discovered
export { default } from "@km/infra/eslint"
```

The [Turborepo approach](https://turborepo.dev/docs/guides/tools/eslint): `@repo/eslint-config` package with composable presets (base, react, next, etc.)

### TypeScript (partial support)

From [tsconfig extends](https://www.typescriptlang.org/tsconfig/extends.html):

- `extends` resolves from `node_modules` since TS 3.2
- Package can expose config via `tsconfig` field in package.json
- **Limitation**: `paths` are relative to the extending file, not the base

**Maximum automation:**

```json
{ "extends": "@km/infra/tsconfig" }
```

But `paths` must be generated at the extending level, not inherited. Options:

1. [vite-tsconfig-paths](https://www.npmjs.com/package/vite-tsconfig-paths) for runtime resolution
2. Generate `paths` from workspace packages at install time
3. Use [Nx TypeScript Project Linking](https://nx.dev/docs/concepts/typescript-project-linking)

### Config Discovery (cosmiconfig)

[Cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) is the de-facto standard for JS config discovery:

- Used by Prettier, Stylelint, and many others
- Searches: `.{name}rc.{json,yaml,js}`, `.config/{name}rc.*`, `{name}.config.js`
- Supports `$import` for config composition
- Caches for performance

**For tools using cosmiconfig**: Simply place config in `.config/` directory.

### Zero-Config Monorepo Tools

[Nx](https://nx.dev/):

- Auto-discovers project structure
- Works with any package manager workspaces
- Deep project graph analysis
- Plugin API for custom behavior

[Turborepo](https://turbo.build/):

- Zero-config build caching
- `turbo.json` only file needed
- Works with existing npm/yarn/pnpm workspaces

[Bumpy](https://github.com/antonreshetov/bumpy):

- Zero-config monorepo releases
- Auto-discovers packages from workspaces config

### Bun Workspaces

From [Bun workspaces docs](https://bun.com/docs/guides/install/workspaces):

- Simpler alternative to Nx/Turbo for smaller projects
- Single `node_modules` with symlinks
- Less boilerplate than enterprise tools

## Proposed Standard Locations

Following XDG-like conventions:

```
.config/                    # Tool configs (cosmiconfig discovers this)
├── vitest.ts              # Vitest config
├── eslint.ts              # ESLint config
├── prettier.ts            # Prettier config
└── typescript/
    └── base.json          # Shared tsconfig

packages/infra/            # Shared presets (npm package)
├── vitest/
├── eslint/
└── typescript/
```

Or even simpler - single `infra/` directory:

```
infra/                     # All shared config
├── vitest.config.ts       # Re-exported by root
├── vitest-setup.ts        # Test quality enforcement
├── eslint.config.ts       # Re-exported by root
├── tsconfig.base.json     # Extended by packages
└── package.json           # Makes it importable as @km/infra
```

## Open Questions

1. **Package name**: `@km/infra`, `km-infra`, or `@beorn/monorepo-infra` (for reuse)?
2. **Bundling**: Should this be published or workspace-only?
3. **vite-tsconfig-paths**: Re-export or peer dependency?
4. **mdspec integration**: Bundle or separate package?
5. **Location**: `.config/` (XDG-style) vs `infra/` vs `packages/infra/`?
6. **TypeScript paths**: Generate at install time or resolve at runtime?

## Related

- `vendor/mdtest` - Markdown test framework (mdspec)
- `tests/vitest-setup.ts` - Current vitest quality enforcement
- `tests/fail-on-console.ts` - Current bun:test quality enforcement

## References

- [XDG Base Directory Specification](https://specifications.freedesktop.org/basedir/latest/) - Standard for config locations
- [cosmiconfig](https://github.com/cosmiconfig/cosmiconfig) - Config discovery for JS tools
- [vite-tsconfig-paths](https://www.npmjs.com/package/vite-tsconfig-paths) - Auto-resolve TS paths
- [Vitest Projects](https://vitest.dev/guide/projects) - Monorepo test configuration
- [ESLint Flat Config in Monorepos](https://github.com/eslint/eslint/discussions/16960) - Discussion on best practices
- [Turborepo ESLint Guide](https://turborepo.dev/docs/guides/tools/eslint) - Shareable config pattern
- [typescript-eslint Monorepos](https://typescript-eslint.io/troubleshooting/typed-linting/monorepos/) - TS linting in monorepos
- [Nx](https://nx.dev/) - Zero-config project discovery
- [@zemd/eslint-flat-config](https://github.com/zemd/eslint-flat-config) - Modern ESLint preset example
