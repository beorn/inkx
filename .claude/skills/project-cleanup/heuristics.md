# Detection Heuristics

Rules for identifying cleanup candidates. Organized by category with patterns, rationale, and exceptions.

## Tracked Artifacts (REMOVE)

Files that should never be committed. Action: `git rm` + add to `.gitignore`.

### Build Output

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| `dist/`, `build/`, `out/`, `.next/`, `.nuxt/` | Regenerated from source | `dist/` intentionally committed for type declarations (check `package.json` `files` field) |
| `*.js.map`, `*.d.ts.map` | Source maps, regenerated | Committed alongside `dist/` type declarations |
| `*.tsbuildinfo` | TypeScript incremental build cache | Never commit |
| `.turbo/`, `.cache/` | Build tool caches | Never commit |

### Test Artifacts

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| `.playwright-cli/`, `playwright-report/` | Playwright console logs and page dumps | Never commit |
| `test-results/`, `coverage/`, `.nyc_output/` | Test runner output | Never commit |
| `__snapshots__/` with binary files | Large snapshot artifacts | Text snapshots may be intentional |
| `*.log` | Log output from test/debug runs | Never commit |

### Refactoring Artifacts

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| `.editsets/`, `editset.json` | Batch refactoring tool state | Never commit |
| `*.bak`, `*.orig`, `*.swp`, `*.swo` | Editor backup/swap files | Never commit |
| `*.patch` at root | Temporary patch files | Intentional patch files in a `patches/` dir |

### Editor/IDE State

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| `.vscode/` (most files) | Editor config | `.vscode/extensions.json` sometimes shared |
| `.idea/`, `*.iml` | JetBrains IDE | Never commit in non-JetBrains projects |
| `.claude/research/` | Claude Code research artifacts | Never commit |

### OS Files

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| `.DS_Store` | macOS Finder metadata | Never commit |
| `Thumbs.db`, `desktop.ini` | Windows Explorer metadata | Never commit |

### Cache/Dependencies

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| `node_modules/` | Package dependencies | Never commit |
| `.bun/`, `bun.lockb` (in some cases) | Bun cache | `bun.lockb` is usually committed |
| `__pycache__/`, `*.pyc` | Python bytecode | Never commit |
| `.mypy_cache/`, `.ruff_cache/` | Python tool caches | Never commit |
| `target/` (Rust) | Cargo build output | Never commit |

### Generated Content

| Pattern | Rationale | Exception |
|---------|-----------|-----------|
| Files with `// @generated` header | Auto-generated code | May be committed if no build step (e.g., protobuf output in some workflows) |
| `*.generated.ts`, `*.gen.ts` | Generated type files | Check if build step regenerates them |
| `CHANGELOG.md` from release tools | Auto-generated from commits | Some projects maintain manually |

## Root Clutter (MOVE)

Files that belong in subdirectories. Action: `git mv` + update cross-references.

### Documentation Files

| File | Destination | Rationale |
|------|-------------|-----------|
| `CONTRIBUTING.md` | `docs/contributing.md` | Keep root lean; `docs/` is the standard location |
| `CNAME` | `docs/site/public/CNAME` or site build dir | Only needed by site deployment, not the library |
| `AGENTS.md` | Merge into `CLAUDE.md` or delete | Redundant with `CLAUDE.md` in most projects |
| `CODE_OF_CONDUCT.md` | `docs/code-of-conduct.md` | Standard location |
| `SECURITY.md` | `docs/security.md` | Unless GitHub requires root placement |
| Architecture docs at root | `docs/` | `ARCHITECTURE.md`, `DESIGN.md`, etc. |

### Test/Benchmark Directories

| Source | Destination | Rationale |
|--------|-------------|-----------|
| `benchmarks/` at root | `tests/benchmarks/` | Group all test-adjacent dirs under `tests/` |
| `e2e/` at root | `tests/e2e/` | Consistent with `tests/` convention |
| `scripts/measure-*.ts` | `tests/benchmarks/` | Benchmark scripts belong with benchmarks |
| `__tests__/` at root | `tests/` | Top-level test dir preferred |

### Script Files

| Source | Destination | Rationale |
|--------|-------------|-----------|
| `*.sh` at root (utility scripts) | `scripts/` | Keep root clean |
| Build/release scripts at root | `scripts/` | Unless referenced directly by `package.json` |

**Exception**: Scripts referenced by `package.json` `scripts` field or CI workflows may need to stay at root or have their references updated when moved.

## Empty/Single-File Directories (FLAG)

| Condition | Action |
|-----------|--------|
| Directory contains 0 files (recursively) | Delete |
| Directory contains exactly 1 file | Flag for review — may be intentional (e.g., `types/index.d.ts`) or candidate for flattening |
| Deeply nested single-child chain (`a/b/c/file`) | Flag — consider flattening |

## Redundant Documentation (FLAG)

Overlap detection methodology:

| Overlap | Action |
|---------|--------|
| >70% shared content | **Merge** into one file, redirect the other |
| 30-70% shared content | **Cross-reference** — keep both but link between them, remove duplicate sections |
| <30% shared content | **Keep both** — they serve different purposes |

### Common Redundancy Patterns

| Pattern | Detection |
|---------|-----------|
| `AGENTS.md` duplicating `CLAUDE.md` | Compare section headers and content; AGENTS.md is often a subset |
| Multiple comparison docs | `*comparison*`, `*vs*`, `*alternative*` — check for overlapping competitor lists |
| Getting-started that repeats README | Compare installation/quickstart sections |
| API docs duplicating JSDoc | Generated docs that are also manually maintained |

## Untracked Files (COMMIT or GITIGNORE)

For files showing in `git status` as untracked:

| Pattern | Action |
|---------|--------|
| Source code, tests, docs | **Commit** — likely new work |
| Build output, logs, caches | **Gitignore** — should have been ignored |
| `.env`, credentials, secrets | **Gitignore** — never commit |
| Large binaries (>1MB) | **Gitignore** or use Git LFS |
| Editor/IDE config | **Gitignore** at user level (`~/.gitignore_global`) |

## Size Thresholds

| Size | Severity | Action |
|------|----------|--------|
| >10MB | **Critical** | Must address — tracked binary or build output |
| 1-10MB | **High** | Likely should be gitignored or use LFS |
| 100KB-1MB | **Medium** | Review — may be legitimate (large test fixtures) |
| <100KB | **Low** | Usually fine unless clearly an artifact |

To find large tracked files:
```bash
git ls-files -z <path> | xargs -0 ls -la 2>/dev/null | awk '{print $5, $9}' | sort -rn | head -20
```
