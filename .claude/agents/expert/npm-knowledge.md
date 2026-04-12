# npm Knowledge — npm agent

Last updated: 2026-04-12

## References (canonical sources — don't duplicate, supplement)

- `vendor/CLAUDE.md` — tsdown + publishConfig pattern, publishing rules
- `.claude/skills/release/SKILL.md` — release workflow (status → diffs → propose → verify → execute)
- `.claude/skills/release/npm-packages.md` — canonical package registry (versions, status, notes)
- `.claude/skills/npm/SKILL.md` — registry tool docs (list, status, audit, placeholders, renamed)

**DRY note**: package inventory below supplements npm-packages.md with operational state (unreleased counts, drift, known issues). On future updates, avoid duplicating the registry — focus on delta: what's changed, what's broken, what's blocked.

## Package Inventory

63 packages listed in npm-packages.md; 60 live on npm under maintainer `beorno`.

### silvery (coordinated versioning, `v<version>` tags)

Monorepo at `vendor/silvery/`. All public packages bump to the same version. Private packages (`@silvery/ag`, `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/ink`, `@silvery/theme`) are workspace-only, bundled into the `silvery` barrel.

| Package | Version | npm | Unreleased | Notes |
|---------|---------|-----|------------|-------|
| `silvery` | 0.17.4 | 0.17.4 | 18 new | Main barrel -- components, hooks, runtime, theme |
| `@silvery/ansi` | 0.17.3 | 0.17.3 | 1 new | ANSI primitives, styling, detection, theme derivation |
| `@silvery/color` | 0.17.3 | 0.17.3 | 1 new | Pure color math -- hex/RGB/HSL, blending, contrast |
| `@silvery/commander` | 0.17.5 | 0.17.5 | 3 new | Colorized Commander.js help |
| `@silvery/examples` | 0.17.7 | 0.17.7 | 5 new | Interactive demos (`npx @silvery/examples`) |

Deprecated silvery packages (bundled into silvery barrel): `@silvery/ag` 0.5.2, `@silvery/ag-react` 0.5.2, `@silvery/ag-term` 0.5.2, `@silvery/commands` 0.5.2, `@silvery/create` 0.5.3, `@silvery/headless` 0.5.1, `@silvery/ink` 0.5.0, `@silvery/model` 0.5.0, `@silvery/scope` 0.5.0, `@silvery/signals` 0.5.0, `@silvery/test` 0.5.3, `@silvery/theme` 0.5.1. These are NOT on npm (local-only, never published to registry).

Internal dependency chain within silvery: `@silvery/color` (zero deps) -> `@silvery/ansi` (depends on `@silvery/color` pinned) -> `@silvery/commander` (depends on `@silvery/ansi` pinned) -> `silvery` (depends on `@silvery/commander` pinned, `loggily` pinned).

### loggily (single package, `v<version>` tags)

At `vendor/loggily/`. Single-package repo.

| Package | Version | npm | Unreleased |
|---------|---------|-----|------------|
| `loggily` | 0.7.0 | 0.7.0 | 11 new |

### flexily (single package, `v<version>` tags)

At `vendor/flexily/`. Single-package repo.

| Package | Version | npm | Unreleased |
|---------|---------|-----|------------|
| `flexily` | 0.6.0 | 0.6.0 | 2 new |

### termless (coordinated versioning, `v<version>` tags)

Monorepo at `vendor/termless/`. All packages share a version. Root = `@termless/core`.

| Package | Version | npm | Unreleased |
|---------|---------|-----|------------|
| `@termless/core` | 0.6.0 | 0.6.0 | 6 new |
| `@termless/cli` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/test` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/xtermjs` | 0.3.1 | 0.3.1 | 4 new |
| `@termless/peekaboo` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/vterm` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/vt100` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/vt220` | 0.1.1 | 0.1.1 | 2 new |
| `@termless/vt100-rust` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/ghostty` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/ghostty-native` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/alacritty` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/wezterm` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/kitty` | 0.3.1 | 0.3.1 | 2 new |
| `@termless/libvterm` | 0.3.1 | 0.3.1 | 2 new |

Note: Despite "coordinated versioning," the versions are currently out of sync -- core is at 0.6.0, most backends at 0.3.1, vt220 at 0.1.1. The tag scheme is `v<version>` but last tag is `v0.1.1` (quite stale).

### vterm (coordinated versioning, `v<version>` tags)

Monorepo at `vendor/vterm/`. Root is private (`"private": true`). Sub-packages published individually.

| Package | Version | npm | Unreleased | Notes |
|---------|---------|-----|------------|-------|
| `vt100.js` | 0.1.2 | 0.1.2 | up to date | |
| `vt220.js` | 0.1.2 | 0.1.2 | up to date | |
| `vterm.js` | 0.1.2 | 0.3.1 | DRIFT | npm has 0.3.1 but local is 0.1.2 |

**Known drift**: `vterm.js` npm=0.3.1 but local package.json says 0.1.2. Also `vt100.js` has version drift in npm-packages.md (md says 0.3.1, live says 0.1.2).

### vimonkey (single package, `v<version>` tags)

At `vendor/vimonkey/`.

| Package | Version | npm | Unreleased |
|---------|---------|-----|------------|
| `vimonkey` | 0.2.4 | 0.2.4 | 2 new |

### bearly (per-package tags, `<name>-v<version>`)

Monorepo at `vendor/bearly/`. Root is private (`"private": true`, version `0.0.0`, never published). Each child package has independent versioning and tag scheme `<shortName>-v<version>`.

| Package | Version | npm | Unreleased | Location |
|---------|---------|-----|------------|----------|
| `@bearly/tribe` | 0.8.1 | 0.8.1 | 5 new | `plugins/tribe/` |
| `@bearly/github` | 0.1.0 | 0.1.0 | 2 new | `plugins/github/` |
| `alien-projections` | 0.1.3 | 0.1.3 | 1 new | `packages/alien-projections/` |
| `alien-resources` | 0.1.3 | 0.1.3 | 1 new | `packages/alien-resources/` |
| `vitepress-enrich` | 0.4.1 | 0.4.1 | 1 new | `packages/vitepress-enrich/` |
| `vitest-silvery-dots` | 0.1.2 | 0.1.2 | 3 new | `packages/vitest-silvery-dots/` |
| `claude-tty-mcp` | 0.1.0 | -- | UNPUBLISHED | `plugins/tty/` |

### Other published packages (not in vendor/)

| Package | Version | Notes |
|---------|---------|-------|
| `mdspec` | 0.3.5 | Markdown spec testing (not a km vendor submodule) |
| `terminfo.dev` | 3.3.1 | Terminal capability database CLI; at `vendor/terminfo.dev/packages/terminfo.dev/` |

### watcher-chaos (NOT released)

At `vendor/watcher-chaos/`. Internal-only. No GitHub repo. Intentionally excluded from release.ts `REPO_CONFIGS`.

## tsdown + publishConfig Pattern

The core publishing pattern used across all vendor packages. Reference implementation: `vendor/loggily/package.json`.

### How it works

**Local dev** (Bun workspace): `exports` points to raw `.ts` source files.

```json
"exports": { ".": "./src/index.ts" }
```

Bun resolves these directly -- no build step needed during development.

**Build** (`npx tsdown`): reads config from the `"tsdown"` field in package.json. Outputs `dist/*.mjs` + `dist/*.d.mts`.

```json
"tsdown": {
  "entry": "src/index.ts",
  "format": "esm",
  "dts": true,
  "clean": true
}
```

Build produces ESM-only output (`.mjs` + `.d.mts`). No CJS build.

**Publish** (`pnpm publish`): applies `publishConfig` overrides. npm consumers see `dist/` exports. Only `dist/` is shipped (`"files": ["dist"]`).

```json
"publishConfig": {
  "access": "public",
  "exports": {
    ".": {
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    }
  }
}
```

### Critical rules

- **`pnpm publish`, not `npm publish`** -- npm does NOT apply `publishConfig.exports` overrides. This is the single most important rule. Using `npm publish` ships raw `.ts` source exports.
- **`files: ["dist"]`** -- only ship built artifacts, never `src/`.
- **`bin` entries also need `publishConfig.bin`** -- source bin (`./src/cli.ts`) becomes dist bin (`./dist/cli.mjs`).
- **Import with `.ts` extensions** in source -- `import { foo } from "./bar.ts"`. tsdown handles rewriting.
- **tsdown `^0.21.7`** is the standard version across all repos.

### Multi-entry example (loggily)

```json
"exports": {
  ".": { "browser": "./src/index.browser.ts", "default": "./src/index.ts" },
  "./worker": "./src/worker.ts",
  "./metrics": "./src/metrics.ts"
},
"publishConfig": {
  "exports": {
    ".": {
      "browser": { "types": "./dist/index.browser.d.mts", "import": "./dist/index.browser.mjs" },
      "types": "./dist/index.d.mts",
      "import": "./dist/index.mjs"
    },
    "./worker": { "types": "./dist/worker.d.mts", "import": "./dist/worker.mjs" },
    "./metrics": { "types": "./dist/metrics.d.mts", "import": "./dist/metrics.mjs" }
  }
}
```

### Workspace builds (monorepos)

```bash
tsdown              # Build the current package
tsdown -W           # Build all workspace packages
tsdown -W -F "pkg"  # Build specific workspace package
```

### Packages without tsdown

`@bearly/tribe` and `@bearly/github` do NOT use tsdown. They publish raw source (`server.ts`) and use a custom `build` script that runs `bun build tools/tribe-proxy.ts --target=bun --outfile=plugins/tribe/server.ts`. Their `files` arrays include `server.ts`, not `dist`.

`terminfo.dev` publishes `src/` and `bin/` directly (`"files": ["src", "bin"]`), no tsdown.

## Exports Maps

### Wildcard exports (dev only)

Silvery uses wildcard subpath exports for local dev:

```json
"exports": {
  "./ui/*": "./src/ui/*.ts"
}
```

Published as:

```json
"publishConfig": {
  "exports": {
    "./ui/*": { "types": "./dist/ui/*.d.mts", "import": "./dist/ui/*.mjs" }
  }
}
```

The tsdown entry must include the glob: `"entry": ["src/ui/*.ts"]`.

### Known gotchas

- **Directory imports**: `import { X } from "silvery/ui"` is a separate export from `"silvery/ui/*"`. Both must be declared.
- **`.tsx` handling**: `vitest-silvery-dots` has a `.tsx` entry point (`src/index.tsx`). tsdown handles it, but the published export is still `.mjs`/`.d.mts`.
- **CSS subpath exports**: `vitepress-enrich` passes CSS files through directly (no tsdown): `"./css/tooltip.css": "./src/css/tooltip.css"`. Same path in both `exports` and `publishConfig.exports`.
- **Workspace `*` in peerDependencies**: termless backend packages use `"@termless/core": "*"` as a peer dep -- this is correct for workspace monorepo packages.
- **Ink/Chalk compat exports**: silvery's dev exports `"./ink": "@silvery/ink"` reference a workspace package name, not a path. These are not in `publishConfig` because they were deprecated.

### vimonkey: no types in publishConfig

vimonkey sets `"dts": false` in tsdown and its publishConfig exports lack types conditions:

```json
"publishConfig": {
  "exports": {
    ".": "./dist/index.mjs",
    "./plugin": "./dist/plugin.mjs"
  }
}
```

## CJS/ESM Interop

All vendor packages are ESM-only (`"type": "module"`, format `"esm"` in tsdown). No CJS output.

### CJS dependencies

- **`@xterm/headless`** (used by `@termless/xtermjs`): CJS package. Bun auto-destructures CJS defaults, but Node.js ESM needs `import xterm from "@xterm/headless"` (default import) not `import { Terminal } from "@xterm/headless"`.
- **`commander`** (used by `@silvery/commander`): Ships both CJS and ESM. No issues.
- **`react-reconciler`** (used by silvery internals): CJS. Bun handles it; Node.js needs default import pattern.

### Node.js version requirement

Most packages declare `"engines": { "node": ">=23.6.0" }` because they rely on Node.js native TypeScript type stripping (available from Node 23.6). Some older packages (silvery, flexily) have `"node": ">=18.0.0"` -- these ship compiled `.mjs` so the Node version constraint is softer.

### Bun vs Node differences

- Bun resolves `workspace:*` deps and raw `.ts` imports at runtime. Node cannot.
- Bun auto-destructures CJS default exports. Node requires explicit `import pkg from "cjs-pkg"`.
- The verify gate uses `node -e "import('pkg')"` specifically to catch things that work in Bun but fail in Node.

## Verify Gate

The verification pipeline is the real quality gate. Any failure blocks the release.

### Full pipeline (`bun release verify <pkg>`)

1. **`cd <package-dir>`** -- enter the package root.
2. **`pnpm pack`** -- creates the tarball with `publishConfig` applied. Critical: `npm pack` does NOT apply publishConfig overrides, so it would create a broken tarball.
3. **Create temp dir** with isolated `NPM_CONFIG_CACHE` -- avoids stale cache contamination from previous installs.
4. **`npm install <tarball> --no-save`** -- installs the tarball in the temp dir, exercises npm resolution.
5. **`publint`** (via `bunx publint`) -- catches manifest/exports/files mismatches. Checks: missing files, incorrect exports conditions, missing types.
6. **`arethetypeswrong --pack`** (via `bunx @arethetypeswrong/cli`) -- CJS/ESM dual checks. Catches: missing type definitions, wrong module resolution, CJS fallback issues. Only runs for packages with types.
7. **`node -e "import('<pkg>').then(...)"` ** -- verifies the main import works in Node.js (NOT Bun). Catches: type-stripping issues (raw `.ts` shipped), missing dependencies, CJS interop failures.
8. **`node -e "import('<pkg>/subpath')"` ** -- for each declared subpath export. Catches: missing subpath entries, broken re-exports.
9. **CLI test** (for packages with `bin`): `node_modules/.bin/<cli> --help`. Fails if exit code is non-zero.

### What each step catches

| Step | Catches |
|------|---------|
| pnpm pack | publishConfig not applied (if using npm pack), wrong `files` glob |
| npm install | Missing dependencies, invalid package structure |
| publint | Missing files in tarball, exports/files mismatch, missing types conditions |
| arethetypeswrong | Type resolution failures, CJS/ESM module kind mismatches |
| Node import | Raw `.ts` shipped instead of `.mjs`, missing deps, CJS default import issues |
| Subpath import | Undeclared subpaths, broken re-exports, directory import gaps |
| CLI test | Broken shebang, missing runtime deps, CLI entry point issues |

### Known edge cases

- **CLI-only packages** (bin but no library exports): skip the import test.
- **Packages with optional peer deps** (e.g., `@termless/core` + `node-pty`): import test may warn but should not fail.
- **Native/WASM backends** (`@termless/alacritty`, `@termless/ghostty`): may need platform-specific builds to verify.

## Coordinated Versioning

### silvery (coordinated, `v<version>` tags)

All public packages share a single version number. When silvery bumps to 0.18.0, so do `@silvery/ansi`, `@silvery/color`, `@silvery/commander`, and `@silvery/examples`. Private packages (ag, ag-react, ag-term, etc.) also bump to the same version but are not published.

Internal cross-deps use exact pinned versions: `"@silvery/color": "0.17.3"` not `"^0.17.3"`. These must be updated during a coordinated bump.

### termless (coordinated, `v<version>` tags)

All 15 packages share a version -- but currently they're out of sync (core=0.6.0, most backends=0.3.1, vt220=0.1.1). The last tag `v0.1.1` is very stale.

### vterm (coordinated, `v<version>` tags)

Three packages (`vt100.js`, `vt220.js`, `vterm.js`) share the monorepo version. Root package is private. Currently at 0.1.2 locally but `vterm.js` shows 0.3.1 on npm (drift).

### bearly (per-package, `<name>-v<version>` tags)

Each package is versioned independently. Tag format: `tribe-v0.8.1`, `vitepress-enrich-v0.4.1`, `alien-projections-v0.1.3`.

The root bearly package stays at `0.0.0` permanently and is never published.

### loggily, flexily, vimonkey (single package, `v<version>` tags)

Simple -- one package per repo, one `v<version>` tag per release.

## Cross-Dep Publish Order

### Dependency graph (cross-repo)

```
Tier 0 (no cross-deps, publish first):
  @silvery/color      (zero deps)
  flexily             (zero runtime deps)
  loggily             (zero deps)
  vimonkey            (peer: vitest)
  vt100.js            (zero deps)
  vt220.js            (zero deps)
  vterm.js            (zero deps)
  alien-projections   (peer: alien-signals)
  alien-resources     (peer: alien-signals)

Tier 1 (depends on Tier 0):
  @silvery/ansi       -> @silvery/color (pinned)
  @termless/core      (no cross-repo runtime deps; loggily/silvery are devDeps only)

Tier 2 (depends on Tier 1):
  @silvery/commander  -> @silvery/ansi (pinned)
  @termless/xtermjs   -> @termless/core (peer)
  @termless/vterm     -> @termless/core (peer), vterm.js
  @termless/vt100     -> @termless/core (peer), vt100.js
  @termless/* backends -> @termless/core (peer)

Tier 3 (depends on Tier 2):
  silvery             -> @silvery/commander (pinned), loggily (pinned)
  @termless/test      -> @termless/core (peer)
  @termless/cli       -> @termless/core

Tier 4 (depends on Tier 3):
  @silvery/examples   -> silvery
  vitepress-enrich    (peer: vitepress)
  vitest-silvery-dots -> silvery (peer), loggily
  terminfo.dev        -> @silvery/ansi, @silvery/commander, silvery
  @bearly/tribe       (runtime: @modelcontextprotocol/sdk only)
  @bearly/github      (runtime: @modelcontextprotocol/sdk only)
```

### Practical publish order for a full release

1. `@silvery/color`
2. `@silvery/ansi`
3. `loggily`
4. `@silvery/commander`
5. `silvery` + `@silvery/examples`
6. `flexily`
7. `vimonkey`
8. vterm packages: `vt100.js`, `vt220.js`, `vterm.js`
9. `@termless/core` then all `@termless/*` backends then `@termless/test`, `@termless/cli`
10. bearly packages (independent): `@bearly/tribe`, `alien-projections`, etc.
11. `vitepress-enrich`, `vitest-silvery-dots`
12. `terminfo.dev`

**Verification cascades**: after repo A publishes, repo B's verify uses A@new from npm (not workspace). Consumer breakage surfaces immediately.

## Known Broken Publishes

### Historical incidents

1. **Workspace masking**: `workspace:*` deps in sub-packages caused Bun to resolve locally but npm consumers got unresolvable deps. Fix: vendor packages must not use `workspace:*` in published deps (only in devDeps).

2. **Raw `.ts` shipping**: Using `npm publish` instead of `pnpm publish` meant `publishConfig.exports` was NOT applied. The tarball shipped `exports: { ".": "./src/index.ts" }` -- works in Bun, fails in Node.js. Fix: always use `pnpm publish`.

3. **Missing deps in tarball**: `"files": ["dist"]` but `dist/` was empty because build wasn't run. Fix: verify gate requires build before pack.

4. **Cross-dep version mismatch**: Silvery packages published with stale pinned versions of internal deps (`@silvery/ansi: "0.16.0"` when 0.17.0 was being published). Fix: coordinated bump updates ALL pinned cross-deps.

5. **Tag-before-publish**: Creating git tags before npm publish succeeded, then publish failed, leaving orphan tags. Fix: tag AFTER successful publish, not before.

### Lessons

- Always use `pnpm publish`, never `npm publish`.
- Always run the verify gate before publishing.
- Tag after publish succeeds.
- Post-publish verify: `npm view <pkg>@<ver>` to confirm registry resolution before publishing dependents.
- Push specific tags (`git push origin refs/tags/<tag>`), not `--tags`.

## Bundle Sizes

Not formally tracked with baselines yet. The tsdown `"clean": true` option ensures fresh builds. Monitor with `ls -la dist/` after build. Key packages to watch:

- `silvery` -- largest bundle (reconciler + components + hooks + theme)
- `@silvery/ansi` -- medium (ANSI parser + styling + detection)
- `loggily` -- designed to be ~3KB, zero deps
- `flexily` -- medium (layout engine, pure JS)
- `@termless/core` -- medium (types + PTY + SVG/PNG + selectors)

## Registry State

### npm maintainer

Username: **beorno**. Local auth via `~/.npmrc`. CI uses `NPM_TOKEN` GitHub Actions secrets.

### Stale placeholders (0.0.1 or empty)

All deprecated with "Placeholder -- not yet published." message:

`aicentral`, `corecmd`, `corecommand`, `silverai`, `silvercode`, `silvercommand`, `silvertea`, `termily`, `textily`, `hottest`, `strictest`, `@visory/visory`, `@finetea/term`, `@finetea/ansi`, `@finetea/core`, `@finetea/ui`, `@termless/term`

`mostlydb` (0.1.0) -- reserved or early prototype.

### Renamed/Superseded (should be deprecated)

| Old Package | Replaced By |
|-------------|-------------|
| `@bearly/vitepress-enrich` (0.3.7) | `vitepress-enrich` (unscoped) |
| `@bearly/mdtest` (0.3.0) | `mdspec` |
| `@silvery/react` (0.3.0) | `silvery` |
| `@silvery/tea` (0.4.2) | `silvery` |
| `@silvery/term` (0.3.0) | `silvery` |
| `@silvery/cli` (0.4.2) | `silvery` |
| `@termless/monorepo` (0.3.0) | `@termless/core` |
| `termless` (0.0.2) | `@termless/core` |

### Current audit drift (as of 2026-04-12)

**In npm-packages.md but not on registry (16 packages)**: mostly correct -- these are local-only private packages or never-published deprecation targets: `@beorn/accountly`, `@beorn/tap`, `@silvery/ag`, `@silvery/ag-react`, `@silvery/ag-term`, `@silvery/commands`, `@silvery/create`, `@silvery/headless`, `@silvery/ink`, `@silvery/model`, `@silvery/scope`, `@silvery/selection`, `@silvery/signals`, `@silvery/test`, `@silvery/theme`, `claude-tty-mcp`.

**Version drift (4 packages)**:
- `@silvery/commander` -- md=0.17.5, live=0.17.4 (md is ahead, likely pre-publish bump)
- `@silvery/examples` -- md=0.17.7, live=0.17.5 (md is ahead)
- `vt100.js` -- md=0.3.1, live=0.1.2 (md is wrong)
- `vt220.js` -- md=0.1.1, live=0.1.2 (md is stale)

## CI Verify Workflows

Six repos have `Verify Publishable` GitHub Actions workflows at `.github/workflows/verify.yml`:

### Common CI pattern (all repos share it)

Triggers: push to `main`, PRs to `main`.

Steps:
1. Checkout + setup Bun (latest) + Node.js 23 + pnpm
2. `bun install`
3. Per-package `verify_pkg()` function:
   - Skip if `private: true`
   - Skip if no `tsdown` config
   - `npx tsdown --no-dts` (build without types for speed)
   - `pnpm pack` (creates tarball with publishConfig)
   - `npm install <tarball>` in temp dir
   - `node -e "import('<pkg>')"` (Node.js import test)

### Per-repo verification targets

| Repo | Packages verified |
|------|-------------------|
| **silvery** | `packages/ansi`, `packages/color`, `packages/commander`, `.` (root), `examples` |
| **loggily** | `.` (single package) |
| **flexily** | `.` (single package) |
| **vimonkey** | `.` (single package) |
| **vterm** | `packages/vt100`, `packages/vt220`, `packages/vterm` |
| **termless** | All packages -- builds all first, packs all tarballs, installs them together, verifies imports |

### Termless CI difference

The termless CI workflow is more sophisticated: it builds ALL packages first, packs ALL tarballs into `/tmp/tarballs/`, installs them ALL together in one temp dir, then verifies each import. This catches cross-package dependency issues that per-package verification would miss.

### Repos WITHOUT CI verify

- **bearly** -- no verify workflow. `@bearly/tribe` and `@bearly/github` use `prepublishOnly` scripts but no CI gate.
- **terminfo.dev** -- no verify workflow.
- **watcher-chaos** -- internal only, not released.

## Release Tool

### `release.ts` -- `.claude/skills/release/release.ts`

Thin orchestration CLI. Run via `bun release <command>`.

| Command | Description |
|---------|-------------|
| `bun release status` | Release status table -- versions, tags, npm state, unreleased commit counts |
| `bun release status -v` | Verbose -- includes commit messages |
| `bun release plan` | Status + what would happen |
| `bun release execute` | Full flow: fix tags, bump, build, verify, publish |
| `bun release execute silvery` | Scope to one repo |
| `bun release fix-tags` | Create missing tags only |
| `bun release verify <pkg>` | Full verification pipeline for one package |

### Repo configuration (`REPO_CONFIGS`)

Hardcoded in release.ts at line 105:

```typescript
{ dir: "vendor/silvery",   monorepo: true,  tagScheme: "shared" }
{ dir: "vendor/loggily",   monorepo: false, tagScheme: "shared" }
{ dir: "vendor/flexily",   monorepo: false, tagScheme: "shared" }
{ dir: "vendor/bearly",    monorepo: true,  tagScheme: "per-package" }
{ dir: "vendor/termless",  monorepo: true,  tagScheme: "shared" }
{ dir: "vendor/vterm",     monorepo: true,  tagScheme: "shared" }
{ dir: "vendor/vimonkey",  monorepo: false, tagScheme: "shared" }
// watcher-chaos: intentionally NOT released
```

### Tag schemes

- `"shared"` -> `v<version>` (e.g., `v0.17.4`). One tag covers all packages in the repo.
- `"per-package"` -> `<shortName>-v<version>` (e.g., `tribe-v0.8.1`). Strips scope prefix.

### State tracking

`.release-state.json` written per repo during execute. Tracks per-package progress:

```typescript
{
  repoName: string,
  version: string,
  packages: Record<string, {
    bumped?: boolean,
    built?: boolean,
    verified?: boolean,
    published?: boolean,
    tagged?: boolean,
    pushed?: boolean
  }>,
  committed?: boolean,
  kmUpdated?: boolean
}
```

This enables resume-after-failure -- re-running execute skips already-completed steps.

### CI status

The `ci` field in status output comes from `git log -1 --format="%ar"` (last commit time), not actual GitHub Actions status. The green "CI=success" label is cosmetic.

### Known limitations

- No `publint` or `arethetypeswrong` in the automated `execute` flow -- these are only in `bun release verify`. The execute flow does pnpm pack + install + import test.
- The `filter` argument to `execute` matches repo names, not package names.
- Post-publish registry lag: the tool does `npm view <pkg>@<ver>` to confirm, but sometimes needs retries.
- `terminfo.dev` and `mdspec` are not in `REPO_CONFIGS` -- they must be released manually.

### Companion tools

- `diffs.ts` -- dumps unreleased commits + full diffs for AI changelog generation.
- `npm-packages.md` -- canonical registry of all published packages. Updated manually after releases.
- `bun npm-registry <cmd>` -- registry queries. Cache at `/tmp/.npm-registry-cache.json` (5 min TTL).
