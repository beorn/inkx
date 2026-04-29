---
id: "@km/infra/namespaces"
aliases:
  - km-infra.namespaces
  - km-infra-namespaces
created_by: claude:18c72b43
created_at: 2026-04-20T17:30:46Z
closed_at: 2026-04-20T18:46:41Z
close_reason: Dissolved. name = short_id = identity under the new model
  (hub/km/design/tribe-matrix.md). No separate namespace facet needed;
  name-minting per parent remains in km-beads.
---

# [x] Namespaces: short-ID minting via per-node namespace facet @km/infra #task #P3

blocks:: [[@km/infra]]

Generalize short-ID generation from the hardcoded 'km-' prefix (in packages/@km/beads/src/short-ids.ts) to a per-node namespace facet. Any node can declare itself a namespace; its children get short IDs formed from the namespace's sigil + name + separator + local id.

## Concept

Per-node namespace facet in frontmatter:

```yaml
namespace:
  sigil: '#' | '@' | '!' | null    # optional sigil for child IDs
  name: 'silvery'                   # namespace name; defaults to node name
  separator: '^'                    # default '^'; scope-into operator
  strategy: 'seq' | 'random-4' | 'bare'
  next_seq: 48                      # for seq strategy
```

Short ID form: `{sigil}{name}{separator}{local}`.

## Why '^' as separator

- Disambiguates compound names: #silvery-refactor is a room name (hyphen part of name); #silvery^47 is item 47 in #silvery namespace
- Matches Obsidian block-reference convention (^blockid)
- '^' has a 'scope-into' semantic feel, rare in plain text
- Never used in everyday words, so auto-linking is unambiguous

## Examples

- #silvery → #silvery^47 (room with items)
- @alice → @alice^1 (agent's work items)
- TUI (no sigil) → TUI^47 (area-prefixed)
- repo root (default) → @km/_orphan/a1b2 (legacy random-4 strategy, backward compat)

## Why this reframe

Collapses several earlier design discussions:

- 'issue sigil' vs 'room sigil' vs 'user sigil' — dissolves; sigils are namespace markers, not type markers
- Short-ID prefix config file — unnecessary; declared per-node
- Backlog view short-ID prominence — comes for free via namespace facet
- #123 vs #TUI-47 conflict (GitHub style) — doesn't exist; #silvery^47 is an item in #silvery namespace, distinct from #silvery itself
- Cross-namespace references — globally unique because sigil+name identifies the namespace

## Auto-link grammar

Pattern: `[#@!]?[\w-]+\^[\w-]+` (namespace ref + separator + local id).
Plus legacy: `km-[a-z0-9]+` for existing random-suffix ids.

## Scope

- Extend packages/@km/beads/src/short-ids.ts with namespace-aware generation + resolution
- Frontmatter parser recognizes 'namespace' facet
- @km/storage indexes namespace nodes for fast lookup
- Link resolver + auto-linker handle the new pattern

## Relationship to other work

- @km/infra/facet-system — namespace is one more facet
- @km/infra/bd-v1-compat — beads keep working; existing @km/_orphan/xxxx IDs unchanged; new beads can use namespace-scoped IDs
- @km/tui/backlog-view — displays short IDs prominently; uses namespace for auto-prefix in a backlog context
- hub/km/design/vision.md — Namespaces section under Knowledge axis

## Deferrable

Design captured; revisit when short-id-prominence work is actively needed (likely during @km/tui/backlog-view or first Matrix-room implementation with item references).