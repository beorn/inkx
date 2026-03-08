# Ideal Root Layouts

Target layouts by project type. Use these to score a project's root and identify what's out of place.

## TypeScript Library (Bun)

Target: **12-18 root items**

```
src/                    # Source code
tests/                  # All tests (unit, e2e, benchmarks)
docs/                   # Documentation
.gitignore
.prettierrc             # Or similar formatter config
CLAUDE.md               # AI assistant instructions
LICENSE
README.md
package.json
tsconfig.json
vitest.config.ts        # Or test config
bun.lock                # Lock file
```

Optional (still acceptable at root):
- `.github/` — CI workflows
- `.husky/` or `.githooks/` — git hooks
- `CHANGELOG.md` — if manually maintained
- `examples/` — usage examples

### TypeScript Library Gitignore

```gitignore
# Build
dist/
*.tsbuildinfo

# Dependencies
node_modules/

# Test artifacts
coverage/
test-results/
playwright-report/
.playwright-cli/
*.log

# Editor/IDE
.vscode/
.idea/

# OS
.DS_Store

# Cache
.turbo/
.cache/
.bun/

# Refactoring artifacts
.editsets/
editset.json
*.bak
*.orig
*.swp
```

## TypeScript Library with Workspaces (Monorepo)

Target: **15-20 root items**

```
packages/               # Workspace packages
apps/                   # Applications (if any)
docs/                   # Shared documentation
scripts/                # Build/release scripts
.gitignore
.prettierrc
CLAUDE.md
LICENSE
README.md
package.json
tsconfig.json           # Base config
tsconfig.build.json     # Build config (if separate)
vitest.config.ts        # Root test config
vitest.workspace.ts     # Workspace test config
bun.lock
turbo.json              # Or nx.json, lerna.json
```

## TypeScript Application

Target: **14-20 root items**

```
src/                    # Source code
tests/                  # Tests
public/                 # Static assets (web apps)
docs/                   # Documentation
.env.example            # Environment template (never .env itself)
.gitignore
CLAUDE.md
LICENSE
README.md
package.json
tsconfig.json
vitest.config.ts
docker-compose.yml      # If containerized
Dockerfile              # If containerized
bun.lock
```

## Monorepo (apps + packages) — km pattern

Target: **18-25 root items**

```
apps/                   # Application packages
packages/               # Library packages
vendor/                 # Git submodule dependencies
docs/                   # Shared documentation
scripts/                # Utility scripts
tools/                  # Development tools
.beads/                 # Issue tracking (beads)
.claude/                # AI assistant config and skills
.github/                # CI/CD workflows
.gitignore
.gitmodules
.prettierrc
CLAUDE.md
LICENSE
README.md
package.json
tsconfig.json
vitest.config.ts
vitest.workspace.ts
bun.lock
```

## Python Package

Target: **10-15 root items**

```
src/<package>/          # Source (src layout)
tests/
docs/
.gitignore
LICENSE
README.md
pyproject.toml
uv.lock                # Or requirements.txt
```

## Rust Crate

Target: **8-12 root items**

```
src/
tests/                  # Integration tests
benches/                # Benchmarks
examples/
.gitignore
Cargo.toml
Cargo.lock
LICENSE
README.md
```

## Root Item Scoring

| Count | Rating | Action |
|-------|--------|--------|
| ≤15 | **Clean** | No action needed |
| 16-20 | **Acceptable** | Review for easy wins |
| 21-25 | **Cluttered** | Systematic cleanup recommended |
| 26-30 | **Messy** | Cleanup needed — likely has tracked artifacts or scattered files |
| >30 | **Out of control** | Urgent cleanup — almost certainly has significant issues |

## Cross-Reference Checklist

Before moving or deleting any file, check these locations for references:

### Source Code References
- [ ] `import`/`require` statements in `*.ts`, `*.tsx`, `*.js`
- [ ] Dynamic imports: `import("path")`
- [ ] `__dirname`/`__filename` based paths

### Configuration References
- [ ] `package.json` — `scripts`, `files`, `main`, `exports`, `bin`, `types`
- [ ] `tsconfig.json` — `include`, `exclude`, `paths`, `references`
- [ ] `vitest.config.*` — `include`, `exclude`, `setupFiles`, `coverage.include`
- [ ] `playwright.config.*` — `testDir`, `outputDir`
- [ ] `.github/workflows/*.yml` — paths in CI steps
- [ ] `turbo.json` — `pipeline` inputs/outputs

### Documentation References
- [ ] `README.md` — relative links, code examples with paths
- [ ] `CLAUDE.md` — file paths, command examples
- [ ] `docs/**/*.md` — cross-links between docs
- [ ] `CHANGELOG.md` — file references in entries

### Git Configuration
- [ ] `.gitignore` — patterns matching the old path
- [ ] `.gitmodules` — submodule paths
- [ ] `.gitattributes` — path-specific attributes

### Other
- [ ] `Dockerfile` — `COPY` commands
- [ ] `docker-compose.yml` — volume mounts
- [ ] `.env.example` — path references
- [ ] `Makefile` — target paths
