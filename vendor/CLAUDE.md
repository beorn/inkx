# vendor/ — Git Submodule Packages

Every directory in `vendor/` is a **standalone git submodule** with its own repo, npm scope, and release cycle. They are developed alongside km but must work independently.

## The Boundary Rule

**vendor packages must never reference `vendor/` paths.** They don't know they're inside km. This applies uniformly — source, docs, CLAUDE.md files inside the vendor package, comments, anything. No "local dev convenience" exception.

| Context                                  | Allowed                                              | Not Allowed                           |
| ---------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| Source code (imports)                    | `@termless/core`, `@silvery/ag-react`                | `../../../vendor/silvery/src/...`     |
| Source code (strings / docstrings)       | `tests/layout.test.ts` (relative to package)         | `vendor/flexily/tests/layout.test.ts` |
| Documentation                            | `npm install @termless/ghostty`                      | `cd vendor/termless && ...`           |
| Links in docs                            | `https://silvery.dev/guide/...`                      | `vendor/silvery/docs/guide/...`       |
| CLAUDE.md **inside** a vendor package    | relative paths (`tests/foo.ts`), npm names, GitHub URLs | `vendor/<pkg>/...` paths              |
| Comments (run-command examples)          | relative paths (`bun tests/foo.ts`)                  | `bun vendor/<pkg>/tests/foo.ts`       |
| References to the private workspace repo | GitHub URL to `silvery-internal` (it's a public repo) | `vendor/internal/silvery/...` paths   |

**Why:** when someone clones `github.com/beorn/silvery` directly (not as a km submodule), `vendor/silvery/` doesn't exist. Hardcoded monorepo paths break standalone usage. A vendor package that survives `git clone <repo> && bun test` without knowing about km is correct; anything else has monorepo-leak.

**Monorepo-specific commands** (e.g., "run all silvery tests from km root with vitest project filter") belong in km files — this `vendor/CLAUDE.md`, the km root `CLAUDE.md`, or `package.json` scripts — never inside the vendor package itself.

## km → vendor references (allowed)

km code _can_ reference `vendor/` paths — it's the monorepo host:

- `bun vitest run vendor/silvery/tests/` — running vendor tests from km root
- `vendor/silvery/docs/guide/the-silvery-way.md` — km CLAUDE.md linking to vendor docs
- `workspace:*` in km's root `package.json` — monorepo dependency resolution

## Cross-vendor references

Vendor packages that depend on each other use **npm package names**, never relative `vendor/` paths:

- `@termless/core` depends on types, not `../../silvery/src/types`
- km root `package.json` `overrides` maps npm names → workspace copies for local dev

## Package Independence Checklist

For any vendor package to be "standalone-ready":

- [ ] No `vendor/` in source code (imports, strings, docstrings, or comments)
- [ ] No `vendor/` in documentation, guides, or package-level CLAUDE.md
- [ ] No `vendor/internal/<pkg>/` refs — use the GitHub URL to the public internal repo
- [ ] No `workspace:*` in its `package.json` (use npm versions or `github:owner/repo`)
- [ ] `bun test` works from the package root (not just from km root)
- [ ] Run-command docstrings use relative paths: `bun tests/foo.ts`, not `bun vendor/<pkg>/tests/foo.ts`

**Audit command:** `grep -rn 'vendor/' vendor/<pkg>/ --include='*.md' --include='*.ts' --include='*.tsx' --include='*.json' | grep -v '/node_modules/' | grep -v '/dist/'` should return zero hits in the vendor package.

## Packages

| Package              | npm Scope              | Description                                                                   |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| **silvery**          | `@silvery/*`           | React TUI framework — reconciler, components, theme                           |
| **flexily**          | `@flexily/*`           | Yoga-compatible flexbox layout engine                                         |
| **termless**         | `@termless/*`          | Headless terminal testing (like Playwright for terminals)                     |
| **ansi**             | `@silvery/ansi`        | ANSI escape sequence utilities                                                |
| **bearly**           | `@bearly/*`            | Claude Code tools — tribe, tty, llm, recall, refactor                         |
| **vimonkey**         | `vimonkey`             | Vitest monkey-patching utilities                                              |
| **loggily**          | `loggily`              | Structured logging                                                            |
| **accountly**        | `@beorn/accountly`     | Multi-account manager — credential switching, quota monitoring, auto-rotation |
| **tap**              | `@beorn/tap`           | Terminal app protocol                                                         |
| **vt100** (vterm)    | `vt100.js`, `vterm.js` | VT terminal emulator monorepo — vt100 + modern                                |
| **watcher-chaos**    | `@beorn/watcher-chaos` | File watcher chaos testing                                                    |
| **silvery-internal** | —                      | Internal design docs (not published)                                          |

## Internal vs Public (`vendor/internal/` vs `vendor/*/`)

`vendor/internal/` is the workspace. `vendor/*/docs/` and `vendor/*/examples/` are the showcase.

**Everything starts internal.** Design docs, example drafts, mockups, prototypes, blog drafts — all begin in `vendor/internal/<project>/`. Don't create WIP content in public directories (`vendor/*/docs/`, `vendor/*/examples/`). Public directories are for polished, approved work only.

**Promotion requires approval.** Before moving anything from internal to public:

1. Content meets quality standards (showcase rubric for examples, editorial review for docs)
2. User has approved the promotion

**Public → internal demotion.** If published content breaks or degrades below quality bar, move it back to internal. Fix there, re-promote when ready.

**Reference rule:** Public docs must never reference `vendor/internal/` content. Internal docs can reference anything.

## npm Publishing

Build with **tsdown**, publish with **pnpm publish**. Local dev uses raw `.ts` with zero build step.

**Reference implementation**: loggily (`vendor/loggily/`)

### Pattern: tsdown + publishConfig

```json
{
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "files": ["dist"],
  "publishConfig": {
    "access": "public",
    "exports": {
      ".": { "types": "./dist/index.d.mts", "import": "./dist/index.mjs" }
    }
  },
  "tsdown": {
    "entry": "src/index.ts",
    "format": "esm",
    "dts": true,
    "clean": true
  },
  "scripts": { "build": "tsdown" },
  "engines": { "node": ">=23.6.0" }
}
```

### How it works

- **Local dev**: `exports` → `./src/index.ts`. Bun workspace resolution reads this. No build needed.
- **Build**: `tsdown` reads config from `"tsdown"` field in package.json. Outputs `dist/*.mjs` + `dist/*.d.mts`.
- **Publish**: `pnpm publish` applies `publishConfig` overrides. npm consumers see `dist/` exports. `src/` is not shipped (`files: ["dist"]`).

### Rules

- **`exports` → `./src/index.ts`** for local dev (Bun resolves directly)
- **`publishConfig.exports`** → `dist/` for npm consumers (pnpm applies overrides)
- **`files` → `["dist"]`** — only ship built artifacts
- **No `bun` condition** — not needed with workspace resolution
- **No `src/` shipped** — only `dist/`
- **`bin` → `publishConfig.bin`** for CLI packages (source bin → dist bin)
- **`pnpm publish`**, not `npm publish` — npm doesn't support `publishConfig.exports`
- **Import with `.ts` extensions** — `import { foo } from "./bar.ts"`

### Workspace builds (silvery monorepo)

```bash
tsdown              # Build the current package
tsdown -W           # Build all workspace packages
tsdown -W -F "pkg"  # Build specific workspace package
```

Config lives in each package's `"tsdown"` field — no config files needed.

### Audit

```bash
bun packages/km-infra/scripts/audit-packages.ts          # Full publishing readiness audit
bun packages/km-infra/scripts/audit-packages.ts --json   # JSON output
```

### Public vs Private packages

Public packages are published to npm. Private packages (`"private": true`) are workspace-only — used internally but never published. The `silvery` barrel bundles all private packages into its `dist/`.

Run `bun packages/km-infra/scripts/audit-packages.ts` to see the full list with status.

## Fixing Violations

When you find a `vendor/` reference in a vendor package:

1. **Source code**: Use `import.meta.dir` or package-relative paths
2. **Docs**: Use npm package names or published URLs (e.g., `silvery.dev`, `termless.dev`)
3. **Scripts**: Detect monorepo vs standalone and adapt paths accordingly
4. **Error messages**: Reference files relative to the package root
