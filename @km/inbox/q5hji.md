---
id: "@km/inbox/q5hji"
aliases:
  - km-q5hji
  - "@km/_orphan/q5hji"
created_by: Bjørn Stabell
created_at: 2026-04-23T22:06:22Z
closed_at: 2026-04-23T23:24:02Z
close_reason: "3-phase refactor landed: config surface renamed
  (collapseParse.patterns → inactive flat array), .km/config.toml consolidated
  into .km/config.yaml with auto-migration, regression tests pin
  inactive-files-do-not-emit-tasks + block-id-collision-active-wins. Commits
  36ee6d7c2, f772897c1, 2c4361603. All acceptance greps clean; 1103 storage
  tests pass (+14 vs baseline); tsc errors: 0→0."
owner: bjorn@stabell.org
assignee: claude:c56dc5d6
---

# [x] [bug] consolidate .km/config → yaml, rename collapseParse→inactive, wire into task-indexer @km/_orphan #bug #P0 #data-integrity #task-indexer #vault-hygiene @claude:c56dc5d6

# Problem

km's task indexer parses every markdown file under the vault, including chat
transcripts at `raw/chats/**` and doc-example code in `ref/Tech/km-user-guide.md`.
Task lines inside those files (often echoed from workstreams as context, or used as
pedagogical examples) surface as real tasks in every task view (`/due`, `@next.md`
aggregation, sigil boards, etc).

## Evidence (2026-04-23 /due run on ~vault)

22 'overdue' tasks surfaced; ~12 were stale duplicates:

| File | Stale items |
|---|---|
| raw/chats/2026-04-12T2009-…md | 5 tax-payment task lines echoed from workstreams |
| raw/chats/2026-04-14T0134-…md | 5 tax-payment task lines echoed from workstreams |
| ref/Tech/@km/user-guide/md | CA FTB task appears 3× as documentation examples (lines 102, 154, 188). Line 154 block-id `^apr15-ca-ftb` collides with the real task block id in `projects/+taxes/workstreams.md:228` |

Real state: every one of those payments was completed on time. At best noise; at worst a missed-deadline false-negative buried in dupes.

## Why this is P0

1. Silent data corruption of task lists.
2. Block-id collision corrupts `km show '^id'` resolution (same family as @agent.md:38).
3. Scales with recall volume — `raw/chats/` grows continuously (Cappie + Claude Code session import). ~30K descendant nodes already.

## Scope (combined)

This bead now consolidates three adjacent fixes into one landing:

### A. Consolidate config into single .km/config.yaml

Currently the vault has TWO config files, which is a UX wart introduced by commit 80f000896 (federation work, 2026-04-22):

- `.km/config.yaml` — user-editable (collapseParse, etc.)
- `.km/config.toml` — machine-managed, holds only `repo_id` ULID

The TOML split was rationalized by (a) zero-dep parsing via Bun.TOML.parse and (b) machine-managed vs hand-edited separation. Both arguments are weak: Bun has YAML.parse too, and a single-key rewrite is trivial to do atomically in YAML. Users seeing two config files is the real cost.

**Action**: move `repo_id` into `.km/config.yaml` under:

```yaml
repo:
  id: 01KPV84JPW6NM8DSRAACP6ZJ59   # machine-managed; do not edit
```

Update `readOrMintRepoId` (packages/@km/storage/src/repo/) to read/mint from yaml. Migration: on startup, if `.km/config.toml` exists and yaml lacks `repo.id`, read from toml + write to yaml + delete toml. Log the migration. One release cycle of compat, then remove the toml reader.

### B. Rename collapseParse → inactive at config surface

`collapseParse.patterns` names the MECHANISM (don't parse descendants). The intent is 'this file doesn't participate in active views'. Rename to describe intent:

```yaml
# .km/config.yaml
inactive:
  - 'raw/chats/**'
  - 'raw/capdocs/**'
  - 'archive/**'
```

Internal implementation keeps the `collapseParse` name. Compat-read the old `collapseParse.patterns` key for one release.

Semantics preserved: inactive files render as opaque stubs (title + content), don't emit tasks/inline-props/sigil mentions/wikilinks as nodes. Still traversable (user can 'km view' an inactive file — promoted on-demand).

### C. Wire inactive matcher into task-indexer + aggregators

Per the existing design note: `createCollapseParseMatcher` is wired into `loader.ts:569`, reading from .km/config.yaml. But chat-transcript tasks still surface in /due — so somewhere in the emit chain the matcher isn't consulted. Audit + short-circuit:

- task indexer emit path (SQL view or JS derivation) — skip inactive file tasks
- /due aggregation — filter inactive-sourced nodes
- @next / @waiting / @agent aggregators — same filter
- sigil-board computations — same
- block-id resolver — when two nodes share a block_id, active wins over inactive (fixes the `^apr15-ca-ftb` collision + same family as @agent.md:38)

## Frontmatter override (per-file escape hatch)

For doc pages in `ref/Tech/` that happen to contain example task lines, a frontmatter flag:

```yaml
---
kmInactive: true
---
```

Resolution: frontmatter > path glob > default active.

## Acceptance

- [ ] `.km/config.toml` no longer exists after migration (for a vault that ran the migration); `.km/config.yaml` holds `repo.id` under `repo:` section
- [ ] `.km/config.yaml` uses `inactive:` key; old `collapseParse.patterns` still readable with deprecation log for one release
- [ ] /due on ~Bear/Vault shows zero tasks sourced from raw/chats/**, raw/capdocs/**, archive/**
- [ ] ref/Tech/@km/user-guide/md example task lines don't surface as real tasks (via frontmatter kmInactive: true on that file, OR via a pattern covering ref/Tech/examples/)
- [ ] Block-id collision between `^apr15-ca-ftb` in docs and real workstream resolves to the real task (active wins)
- [ ] Regression test: synthetic fixture with raw/chats/echo.md + project/real.md containing the same task line → only project/real.md emits
- [ ] Migration: user's vault auto-migrates on first open post-upgrade (toml→yaml + collapseParse→inactive rename logged)

## Related

- `~/Bear/Vault/@agent.md:38` — existing block_id persistence bug (same family, different surface)
- `packages/km-storage/src/markdown/collapse-parse.ts` — existing matcher (mechanism stays)
- `packages/km-storage/src/repo/` — readOrMintRepoId (currently reads .km/config.toml)
- `scripts/verify-collapse-parse.ts` — demonstrates the canonical pattern set
- `~/Bear/Vault/ref/Tech/km-user-guide.md:102,154,188` — current offending doc examples
- commit 80f000896 — introduced .km/config.toml as a separate file (this bead reverses that split)