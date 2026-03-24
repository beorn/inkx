# vendor/ — Git Submodule Packages

Every directory in `vendor/` is a **standalone git submodule** with its own repo, npm scope, and release cycle. They are developed alongside km but must work independently.

## The Boundary Rule

**vendor packages must never reference `vendor/` paths.** They don't know they're inside km.

| Context                 | Allowed                                               | Not Allowed                           |
| ----------------------- | ----------------------------------------------------- | ------------------------------------- |
| Source code (imports)   | `@termless/core`, `@silvery/ag-react`                 | `../../../vendor/silvery/src/...`     |
| Source code (strings)   | `tests/layout.test.ts` (relative to package)          | `vendor/flexily/tests/layout.test.ts` |
| Documentation           | `npm install @termless/ghostty`                       | `cd vendor/termless && ...`           |
| Links in docs           | `https://silvery.dev/guide/...`                       | `vendor/silvery/docs/guide/...`       |
| CLAUDE.md files         | `vendor/` paths OK (local dev context, not published) | —                                     |
| Comments (run examples) | `vendor/` paths OK (developer convenience)            | —                                     |

**Why:** When someone clones `github.com/beorn/termless` directly (not as a km submodule), `vendor/silvery/` doesn't exist. Hardcoded monorepo paths break standalone usage.

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

- [ ] No `vendor/` in source code strings (except comments)
- [ ] No `vendor/` in documentation or guides
- [ ] No `workspace:*` in its `package.json` (use npm versions or `github:owner/repo`)
- [ ] `bun test` works from the package root (not just from km root)
- [ ] CLAUDE.md can reference `vendor/` (it's local dev context, not published)

## Packages

| Package              | npm Scope       | Description                                               |
| -------------------- | --------------- | --------------------------------------------------------- |
| **silvery**          | `@silvery/*`    | React TUI framework — reconciler, components, theme       |
| **flexily**          | `@flexily/*`    | Yoga-compatible flexbox layout engine                     |
| **termless**         | `@termless/*`   | Headless terminal testing (like Playwright for terminals) |
| **ansi**             | `@silvery/ansi` | ANSI escape sequence utilities                            |
| **mdtest**           | `@beorn/mdtest` | Markdown-driven test runner                               |
| **tools**            | `@beorn/tools`  | CLI tools, LLM integration, recall                        |
| **vimonkey**         | `vimonkey`      | Vitest monkey-patching utilities                          |
| **loggily**          | `loggily`       | Structured logging                                        |
| **accountly**        | `accountly`     | LLM API accounting/cost tracking                          |
| **tap**              | `@silvery/tap`  | Terminal app protocol                                     |
| **bearlymade**       | —               | Bear.app integration                                      |
| **watcher-chaos**    | —               | File watcher chaos testing                                |
| **silvery-internal** | —               | Internal design docs (not published)                      |

## ESM Publishing (Sindre Sorhus Pattern)

All published packages must follow the **compiled ESM** pattern. **Never publish raw `.ts` source.**

**Reference implementation**: flexily (`vendor/flexily/`)

### package.json
```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "types": "./dist/index.d.ts",
  "main": "./dist/index.js",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "bun run build"
  },
  "engines": { "node": ">=18" }
}
```

### tsconfig.build.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

### Rules
- **`exports` → `./dist/*.js`** — never `./src/*.ts`
- **`types` → `./dist/*.d.ts`** — generated declarations, not raw source
- **`module` → `"NodeNext"`** in tsconfig — not `"bundler"` (that's dev-only)
- **`files` → `["dist"]`** — ship compiled output, not source
- **`dist/` in `.gitignore`** — built artifacts not tracked
- **`prepublishOnly: "bun run build"`** — auto-build before npm publish
- **No `require()`** — ESM only, use `import`
- **No silent `catch {}`** — fail fast, fail loudly

### Anti-patterns
| Wrong | Right |
|-------|-------|
| `"exports": { ".": "./src/index.ts" }` | `"exports": { ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" } }` |
| `"moduleResolution": "bundler"` | `"moduleResolution": "NodeNext"` |
| `"noEmit": true` in published package | `"declaration": true, "outDir": "dist"` |
| `"files": ["src"]` | `"files": ["dist"]` |
| `} catch {}` | `} catch (err) { throw new Error(...) }` |

## Fixing Violations

When you find a `vendor/` reference in a vendor package:

1. **Source code**: Use `import.meta.dir` or package-relative paths
2. **Docs**: Use npm package names or published URLs (e.g., `silvery.dev`, `termless.dev`)
3. **Scripts**: Detect monorepo vs standalone and adapt paths accordingly
4. **Error messages**: Reference files relative to the package root
