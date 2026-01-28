# Monorepo Infrastructure Package

Centralize tool configuration out of the monorepo root into a reusable `@km/infra` package.

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
│       └── mdtest.ts   # .test.md support (or re-export from beorn-mdtest)
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
3. **Test file patterns** - `.test.ts`, `.test.md`, `.spec.ts`
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

## Open Questions

1. **Package name**: `@km/infra`, `km-infra`, or `@beorn/monorepo-infra` (for reuse)?
2. **Bundling**: Should this be published or workspace-only?
3. **vite-tsconfig-paths**: Re-export or peer dependency?
4. **mdtest integration**: Bundle or separate package?

## Related

- `vendor/beorn-mdtest` - Markdown test framework
- `tests/vitest-setup.ts` - Current vitest quality enforcement
- `tests/fail-on-console.ts` - Current bun:test quality enforcement

## References

- [vite-tsconfig-paths](https://www.npmjs.com/package/vite-tsconfig-paths) - Auto-resolve TS paths
- [Nx presets](https://nx.dev/concepts/generators) - Similar concept in Nx
- [create-react-app](https://create-react-app.dev/) - Zero-config bundling approach
