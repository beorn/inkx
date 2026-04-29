---
id: "@km/storage/content-issues"
aliases:
  - km-storage.content-issues
  - km-storage-content-issues
created_by: Bjørn Stabell
created_at: 2026-04-25T05:33:50Z
---

# [ ] Content / data-model issues discovered during vault use — running list @km/storage #chore #P2 #content-model #km-storage #vault-feedback

# @km/storage: Content / data-model observations from vault use

A running list of edge cases, parser behaviors, schema asymmetries, and model
tensions noticed while operating the vault (`/due`, `@next` aggregation, sigil
boards, grooming, etc.).

These are **observations**, not specs. They describe what we see, why it
surprises us, and what design tension or open question it points to. They
are *not* prescriptions of how to fix anything. When we revisit km's
content/data model (post Quality Plateau, Sterling-purge, etc.), these are
the real-world frictions worth thinking about. Whether each becomes a
schema change, a parser tweak, a query-layer affordance, or no change at
all is a future design call.

Maintained by: vault sessions. Append via `bd note km-storage.content-issues`
when something else surfaces. Keep entries short — observation + tension,
no recommended fix.

---

## Observations seeded 2026-04-24

### fs-path on tasks
Task nodes carry `fs_path = NULL`; only file/heading nodes have it. Filtering
tasks by source path requires a recursive `parent_id` walk. Tension: the
asymmetry isn't visible from the schema alone — every consumer either
reimplements the walk or gets wrong answers silently.

### Embedded sigil-aggregation copies
Tasks under `km.add::` headings appear alongside the canonical task as
embedded copies. The same task surfaces 2-3× in raw queries. Tension: the
copy is structurally identical to the original, so consumers can't tell from
the row whether they're looking at canonical state or a render artifact.

### Inline-prop parser greedy on EOL
`@sigil` placed *after* inline props gets absorbed as text into the previous
prop's value. `priority:: P1 @heisann` produces `priority: "P1 @heisann"`
and no `@heisann` mention. Tension: prop-value parsing has no notion of
sigil boundaries inside its scan, even though sigils are first-class
elsewhere in the model.

### Empty task_status on calendar-style bullets
Bullets in calendar files (date-only headings, prose calendar lines that
*look* like tasks) parse as nodes with `task_status = ''` (empty string,
not NULL). Tension: an empty-status node is shaped like a task but isn't
actionable; the data model uses two different "absence" sentinels (NULL vs
empty string) without a documented distinction.

### Block-id collisions across files
Block IDs are global. `^apr15-ca-ftb` was defined in both
`ref/Tech/km-user-guide.md` (doc example) and
`projects/+taxes/workstreams.md` (real task). `km show '^id'` resolution
becomes ambiguous. Tension: the model treats every active file as part of
one global ID namespace, which means doc/example content collides with
real content unless authors coordinate.

### Config-surface migration with no compat shim
Bead @km/_orphan/q5hji renamed `collapseParse.patterns` → `inactive` (flat array).
Test `packages/km-storage/tests/config.test.ts:314` deliberately asserts the
legacy key is silently ignored — no compat shim, no warning. The vault's
config (still using the old name) became a silent no-op. Tension: yaml
config loading has no way to surface "you wrote a key I don't recognize" to
the user, so typos and stale schemas degrade silently.

### Incremental sync doesn't re-evaluate inactive globs
Adding new globs to `inactive:` doesn't retroactively remove already-ingested
nodes from state.db. Only re-parses files whose mtime changed. Tension:
config changes that affect node visibility don't propagate through
incremental sync — there's an implicit "rebuild required" the user has to
know about.

### Path-driven semantic role isn't first-class
`archive/Asana/` (27K Asana export tasks from 2013–2024) and `raw/chats/`
(Claude session transcripts that echo workstream content) are
*semantically different* from active vault content — they're reference, not
action. The model parses them homogeneously; distinguishing them requires
per-vault config opt-in. Tension: vault organization conventions encode role
information that the schema doesn't capture, so every consumer has to reason
about path patterns themselves.

### Parser permissive on degenerate task content
A literal placeholder `- [ ] content due:: 2026-04-15 ^jecb` in
`ref/Tech/km-user-guide.md` parsed as a real task with title `"content"`
and surfaced as an overdue P0 in `/due`. Tension: there's no minimum bar
for what constitutes meaningful task content — single-token bodies pass
through unchallenged.

### Mirror staleness between canonical and embedded views
`@agent.md:234-235` showed two Jose-email tasks as `[ ]` while canonical
state in `workstreams.md:231-232` was `[x]`. Tension: the embed-copy has
its own `[ ]/[x]` state on disk, separate from the canonical line, and
they can drift. The model treats sigil-aggregated views as separate writable
surfaces rather than read-through projections.

### Doctor-rebuild + sync produce empty DB on schema 3→6
Attempted the actual fix path tonight (rename .km/config.yaml from
`collapseParse.patterns` → `inactive:`, then `km doctor rebuild`).
`km doctor rebuild` ran <2s, output only the header line, exited 0.
state.db went from ~1.5G to 192K with **1 node**. No backup created
by the rebuild itself. Subsequent `km sync` (with both new and reverted
config) also exits in <2s producing the same 1-node DB.

Restored from `.km/state.db.bak-2026-04-17` (740M, 533k nodes); vault DB
is now 7 days behind worktree. Worktree itself is intact. /due SQL
workarounds compensate for the raw/archive pollution at query time, but
@km/tui board views, `@next.md` aggregation, sigil boards — anything that
reads state.db — are stale.

Schema drift suspected: meta says `schema_version=3 / data_version=1`;
current km HEAD has `SCHEMA_VERSION=6` (`packages/km-storage/src/db/schema.ts:48`).
Comments in that file describe a `DATA_VERSION=2` step that should trigger
a full re-ingest from worktree, but the actual rebuild produces nothing.

This is the most concrete and most disruptive observation here — schema
migrations from old DBs don't produce a usable state.db on the current
codebase. Storage team has been pinged via DM with a pointer to this entry.

---

## Adding observations

```bash
bd note km-storage.content-issues "## short-slug
<one paragraph: what surfaced, why it's surprising, what model tension it
exposes — no fix prescription>"
```

Or `bd comment km-storage.content-issues` for threaded discussion.

Spin-out attempted 2026-04-24 (9 design beads briefly created, then
reverted). Bjørn's intent is consolidated running-list, not an epic of
children. Future appenders: add notes here, don't promote without explicit
user sign-off.
