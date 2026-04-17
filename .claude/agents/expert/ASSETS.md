# Expert Agent Asset Registry

Every asset is owned by exactly one agent. If it's not listed, it's unowned (arch should claim or assign it).

## Information Architecture (DRY layers)

See `INFO-ARCHITECTURE.md` for the full design. Summary:

| Layer | Contains | Example |
|---|---|---|
| **Canonical docs** | Design truth (what + why) | `docs/design/model/knode.md` |
| **CLAUDE.md** | Session entry points (summaries + pointers) | Root `CLAUDE.md` |
| **Skill files** | Procedural workflows (how to execute) | `.claude/skills/release/SKILL.md` |
| **Knowledge files** | Operational delta (state, gotchas, failures) | `*-knowledge.md` |
| **Memory files** | User prefs + feedback | `memory/MEMORY.md` |

**Rule**: every piece of information lives in exactly one layer. Knowledge files reference canonical docs, never duplicate them.

## arch

### Files
- `CLAUDE.md` — Architecture, Code Style, Gotchas sections
- `docs/README.md` — layered architecture overview
- `docs/packages.md` — package inventory with layers + APIs
- `docs/glossary.md` — terminology definitions
- `docs/principles.md` — code style, patterns, design philosophy
- `docs/design/model/knode.md` — co-owned with km agent
- `docs/design/tea-state-machines.md` — co-owned with km agent
- `docs/lessons/*.md` — postmortems + learnings
- `.claude/agents/expert/arch-knowledge.md` — deep reference

### Other
- Layer boundary rules (enforced by review, not tooling)
- Factory function / no-class / using-cleanup conventions

## silvery

### Files
- `vendor/silvery/CLAUDE.md` — pipeline overview, key internals, debugging, testing
- `vendor/silvery/packages/ag-term/src/pipeline/CLAUDE.md` — pipeline internals
- `vendor/silvery/packages/ag-term/src/pipeline/RENDERING.md` — step-by-step algorithm
- `vendor/silvery/packages/ag-term/src/pipeline/LESSONS.md` — postmortems
- `vendor/flexily/CLAUDE.md` — layout algorithm docs
- `vendor/silvery/docs/guide/the-silvery-way.md` — canonical component guide
- `vendor/silvery/docs/guide/styling.md` — semantic colors, typography
- `vendor/silvery/docs/guide/debugging.md` — STRICT mode, diagnostics
- `.claude/agents/expert/silvery-knowledge.md` — deep reference

### Other
- silvery.dev (VitePress site, CI: `.github/workflows/docs.yml`)
- flexily docs (beorn.github.io/flexily)
- SILVERY_STRICT environment variable behavior
- Benchmark baselines (`vendor/silvery/tests/*.bench.ts`)

## km

### Files
- `apps/km-tui/CLAUDE.md` (if exists)
- `apps/km-tui/tests/CLAUDE.md` — test patterns, assertion hierarchy
- `docs/design/model/knode.md` — co-owned with arch agent
- `docs/design/ui/selection.md` — selection system
- `docs/design/tea-state-machines.md` — co-owned with arch agent
- `docs/lessons/input-architecture.md` — input pipeline
- `docs/lessons/reproduce-first.md` — debugging methodology
- `.claude/agents/expert/km-knowledge.md` — deep reference

### Other
- Keybinding reference (`docs/ref/keybindings.md` if exists)
- Test vaults (`apps/km-tui/tests/fixtures/`)
- Showcase test (`apps/km-tui/tests/showcase.spec.ts` — canonical example)

## npm

### Files
- `vendor/CLAUDE.md` — tsdown + publishConfig pattern, publishing rules
- `.claude/skills/release/SKILL.md` — release workflow
- `.claude/skills/release/release.ts` — release tool source
- `.claude/skills/release/diffs.ts` — diff tool source
- `.claude/skills/release/npm-packages.md` — package registry (versions, status)
- `.claude/skills/npm/SKILL.md` — registry tool docs
- `.claude/skills/npm/registry.ts` — registry tool source
- `.claude/agents/expert/npm-knowledge.md` — deep reference

### Other
- npm registry (maintainer: beorno, 60+ packages)
- GitHub repos: beorn/silvery, beorn/loggily, beorn/flexily, beorn/termless, beorn/vterm, beorn/vimonkey, beorn/bearly (release workflows, tags, GitHub Releases)
- npm tokens (local ~/.npmrc + CI NPM_TOKEN secrets)
- CI verify workflows (`.github/workflows/verify.yml` per repo)
- `.release-state.json` per repo (resume state)

## Unassigned (arch should triage)

- `vendor/bearly/CLAUDE.md` — tribe, tools, plugins (needs a tribe/tools agent?)
- `vendor/termless/CLAUDE.md` — termless docs (owned by npm for packaging, silvery for testing?)
- `vendor/loggily/CLAUDE.md` — loggily docs
- `.claude/skills/sop/SKILL.md` — SOP skill (meta — owned by `/sop` itself?)
- `.claude/skills/tribe/` — tribe coordination
- `vendor/internal/` — private design docs (per-project ownership?)
- DNS domains: silvery.dev, termless.dev, terminfo.dev, beorn.codes
- LLM accounts: OpenAI, Anthropic, Google, xAI, OpenRouter (via accountly)
- Cloudflare analytics accounts
- GitHub org/user settings, branch protection rules
