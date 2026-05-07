---
id: "@km/import/asana-projects-as-sigil-nodes"
type: refactor
priority: P2
created_at: 2026-05-07T00:25:00.000Z
parent: "@km/import"
---

# [ ] Asana projects become +nodes with link relationships (like sigil boards) #refactor #P2

User directive (2026-05-07): "asana projects become +nodes for us - there should still be a link relationship (like sigil board)".

## Today

The Asana import (`apps/km-cli/src/import/convert.ts`) treats projects as plain folders/files:

- Project file naming: `<wsSlug>/<teamSlug>/<projectSlug>.md` (no sigil prefix)
- Tasks belonging to a project: rendered into the project's file body, no inline `+project` mention back to the project — UNLESS `item.projects.length > 1` (then "other" projects get `+slug` mentions but the primary doesn't)
- No `rules.add` on project files; they're static text dumps
- Tag projects already use `#tag.md` aggregate files (`generateTagFiles`); user projects already use `@user.md`. **Projects are the missing third sigil.**

Per `docs/dev/agent-dispatch.md` + `docs/design/model/storage.md` § NodeRules, the canonical km pattern for "this thing aggregates everything mentioning it" is:

1. The aggregator file lives at `<sigil><name>.md`
2. Every member has `<sigil><name>` in its content → lands `km:<sigil><name>` in the `links` table
3. The aggregator carries `rules.add: "<sigil><name>"` → sync materializes `![[<member>]]` embeds INTO the aggregator's body

The Asana import already does (1) for `#tags` and `@users`. Projects are the gap.

## Target

After this refactor, an Asana project named "API Refactor" produces:

- File: `<wsSlug>/<teamSlug>/+api-refactor.md` (sigil-prefixed name)
  ```yaml
  ---
  id: "+api-refactor"               # OR scoped if collisions
  agent: silvercode                 # pattern-borrow from @agent/N
  rules:
    add: "+api-refactor"
  ---

  # +api-refactor — <project description>

  <persona-equivalent: project context, ownership, links to docs>

  ## Queue

  <!-- materialized embeds appear here on next sync -->
  ```

- Every task that belongs to that project (regardless of whether it has multiple projects) gets `+api-refactor` in its title content. Today's "only mention non-primary projects" logic is wrong — it assumes the file path encodes the primary association, but the `links` table is the canonical store; **every** project-membership should produce a link row.

- The link relationship goes through the canonical pipeline (extractor → links table → rules.add materialization). `bd query "+api-refactor"` returns matching tasks. Backlinks work. Sigil-mention-driven boards (Phase 1.1 of `@km/agent/sigil-boards`) made this end-to-end live; Asana imports just need to emit the right surface form.

## Scope

### File naming change

`apps/km-cli/src/import/convert.ts:1042-1056` — the project filename construction. Add `+` prefix to `projectSlug`:

```ts
// Before
filename = `${wsSlug}/${teamSlug}/${projectSlug}.md`
// After
filename = `${wsSlug}/${teamSlug}/+${projectSlug}.md`
```

(Same prefix wherever the project filename is composed — also lines 1050, 1054.)

### Task content change

`apps/km-cli/src/import/convert.ts:178-185` — `buildTaskContent`. Today only "other" projects get mentions. Change to: ALWAYS emit `+<projectSlug>` for every project the task belongs to (including the primary).

```ts
// Before
if (item.projects && item.projects.length > 1) {
  const otherProjects = currentProject
    ? item.projects.filter((p) => slugify(p) !== slugify(currentProject))
    : item.projects
  if (otherProjects.length > 0) {
    parts.push(...otherProjects.map((p) => `+${slugify(p)}`))
  }
}
// After
if (item.projects && item.projects.length > 0) {
  parts.push(...new Set(item.projects.map((p) => `+${slugify(p)}`)))
}
```

The `Set` dedups; same pattern as the tag emission directly above.

### Frontmatter & rules.add on project files

When the project file is generated (`projectToNodes` writes the file body), inject:

```yaml
rules:
  add: "+<projectSlug>"
```

into the file's frontmatter. Mirror the `@agent/N` pattern from the boards.

### Primary-map / cross-references

`apps/km-cli/src/import/convert.ts:1070` — `mapTarget` uses `filename ?? ""`. After the rename, the cross-reference path becomes `<wsSlug>/<teamSlug>/+<projectSlug>.md` — `mapTarget` should pick up the new filename automatically. Verify that links between projects (existing Asana inter-project linkages) resolve through the new name.

### Tag aggregate parity check

`generateTagFiles` already emits `<wsSlug>/tags/#<slug>.md`. The project equivalent should follow the same pattern OR live alongside the team folders. Decide: is `+<slug>` at the team level (current) or aggregated under `<wsSlug>/projects/+<slug>.md`? Recommend **team level** — it preserves Asana's organizational structure and avoids re-shuffling existing files.

## Phased plan

### Phase 1 — File naming + always-mention

- Rename project files to `+<projectSlug>.md`
- `buildTaskContent`: always emit `+<projectSlug>` (not just for multi-project tasks)
- Update `primaryMap` and any inbound cross-references in the test fixture suite
- Tests: `apps/km-cli/tests/import/convert.test.ts` — verify project file path includes `+`, verify task content includes the project mention

### Phase 2 — `rules.add` injection on project files

- `projectToNodes` (or wherever the file's frontmatter is written) — inject `rules: { add: "+<projectSlug>" }`
- Tests: parse a sample project file, verify the frontmatter

### Phase 3 — End-to-end verification

- Import a real-shape Asana fixture
- Run `km sync --from-fs` (rebuilds links table from the imported `.md`)
- Verify `bd query "+api-refactor" --all-tasks` returns the expected tasks
- Verify the project file's `## Queue` section gets materialized embeds after sync
- Verify backlinks: from a task body, `bd backlinks <task-id>` shows the project (this requires the inverse query — links table makes it natural)

## Out of scope

- **Asana adapter `data.projects` field on `ImportData`** is NOT the same as the deprecated `node.data.projects` from L5 Phase 2 — keep using it as the import source-of-truth; no semantic change to the adapter's interface.
- **Workspace-level renames** (e.g., should `<wsSlug>` itself become a sigil node?) — defer; the canonical sigils are `@`, `#`, `+`. Workspaces are a higher-level Asana concept; don't shoehorn.
- **Importing user task lists** (`user-<gid>` projects) — already use `@<userSlug>.md`; no change needed.
- **Tag projects** (`tag-<gid>`) — already use `#<tagSlug>.md` via `generateTagFiles`; no change needed.

## Acceptance

- [ ] All non-tag, non-user Asana project files renamed to `+<slug>.md`
- [ ] Every imported task content includes `+<projectSlug>` for every project it belongs to (Set-deduped)
- [ ] Every project file has `rules.add: "+<slug>"` frontmatter
- [ ] After import + sync: `bd query "+<projectSlug>"` returns the project's tasks via the links table
- [ ] `convert.test.ts` covers all three: file naming, content emission, frontmatter
- [ ] `bun fix && bun vitest run apps/km-cli/tests/import/` green
- [ ] **Cross-cutting**: the existing `data.projects` reads in `convert.ts` (lines 992-1227) STILL refer to `ImportData.projects` (Asana source structure), NOT `node.data.projects` (the L5-deprecated km field). No collision; verify with grep.

## Tracking

Subsumes the Asana-specific portion of `@km/all/L5-deprecation-purge` "out-of-scope follow-ups."
