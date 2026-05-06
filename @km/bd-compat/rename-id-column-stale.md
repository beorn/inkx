---
aliases:
  - km-bd-compat.rename-id-column-stale
  - km-bd-compat-rename-id-column-stale
created_at: 2026-05-06T21:33:27.269Z
---

# km bd rename leaves top-level id column stale in DB cache #bug #P3

`km bd rename <old-id> <new-id>` correctly updates:
- File system path (file moves)
- Frontmatter `id:` (after `km sync --to-fs`)
- Frontmatter `aliases:` (old form added for back-compat)
- Body wikilinks in referencing beads

But the top-level `id` column in the DB cache stays at the OLD value. `km bd list --json` shows `{ "id": "@km/all/sterling.md", "fs_path": "@km/silvery/sterling.md" }` — id and fs_path disagree.

Encountered during scope consolidation: `km bd list -s open --json | jq 'group_by(.id)'` reported the pre-rename scope distribution even after all renames + sync ran. Reindex / fresh load (delete .km/state.db and resync from FS) would fix the display drift.

Acceptance:
- After `km bd rename A B`, `km bd show A` returns 'not found' (or alias-resolves to B with B as the canonical id)
- After `km bd rename A B`, `km bd list --json` shows `{ "id": "B", "fs_path": "<B's path>" }`
- No need for explicit reindex to see the new id

Workaround until fixed: the on-disk state is correct (frontmatter id matches new path); only the DB display is stale. Reading files directly works.
