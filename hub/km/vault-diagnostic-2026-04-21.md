# Vault Node Explosion — Diagnostic & Remediation Proposal

**Bead**: [km-storage.vault-node-explosion](https://github.com/beorn/km/issues) (P1, IN_PROGRESS)
**Stream**: C1 of km-all.plateau (P0)
**Date**: 2026-04-21
**Tooling**: `scripts/vault-diagnostic.ts` (read-only over `.km/state.db`)
**Snapshot**: `/tmp/vault-state-snapshot.db` (copy of `~/Bear/Vault/.km/state.db` at 22:51 PDT)

---

## TL;DR

The vault is not suffering from a schema or parser bug. The "549K nodes" number
is roughly correct for what's on disk — **554,663 nodes across 18,327 files**,
~30 nodes per file average. But the distribution is extremely lopsided:

- **One directory holds 70% of all nodes.** `raw/chats/*` (Claude Code session
  transcripts) = **390,402 nodes (70.4%)**.
- **The top 20 heaviest files hold 58% of all nodes.** 17 of those 20 are chat
  transcripts. Each transcript averages ~14K nodes.
- **Archived Asana data adds another 19%.** `archive/Asana/*` = 103,527 nodes,
  dominated by two files: `pers-prod.md` (36,647) and `@bjørn-stabell.md`
  (17,452).
- **Templated morning-routine journal content contributes ~11K duplicate
  nodes** — 550+ copies of identical planning bullets, one per day.

Subtract chats and Asana archives and the "real" working vault is about
**60K nodes across ~17,500 files** — comfortable scale. The explosion is
import-driven content, not a model problem.

---

## Top-line numbers

| Metric | Value |
|---|---|
| Total nodes | **554,663** |
| Distinct files | 18,327 |
| Avg nodes per file | 30.3 |
| Items (`item=1`) | 350,688 (63.2%) |
| Blocks (`item=0`) | 203,975 (36.8%) |
| Embed nodes (`embed_of IS NOT NULL`) | 5,248 |
| Max tree depth | 14 |
| Avg children per parent | 4.05 |
| Max children under one parent | **7,389** (under "Today" in daily journal) |

## Top-level attribution

Every node attributed to its nearest `mdfile`/`file` root, bucketed by
top-level directory:

| top-level | nodes | % |
|---|---:|---:|
| `raw/chats/` | **390,402** | **70.4%** |
| `archive/Asana/` | 103,527 | 18.7% |
| `ref/` | 27,198 | 4.9% |
| `journals/` | 12,236 | 2.2% |
| `projects/` | 8,523 | 1.5% |
| `@inbox/` | 3,729 | 0.7% |
| `archive/other` | 2,767 | 0.5% |
| `areas/` | 2,513 | 0.5% |
| `(orphan — no file ancestor)` | 2,318 | 0.4% |
| `(top-level file)` | 1,450 | 0.3% |

## Top 10 heaviest files (descendant count)

Counts include all transitive descendants under each file root (SQL recursive
CTE over `parent_id` — `fs_path` is only set on the file node itself).

| rank | nodes | path |
|---:|---:|---|
| 1 | 36,647 | `archive/Asana/stabell/bjørn/pers-prod.md` |
| 2 | 27,444 | `raw/chats/2026-03-18T1151-base-directory-for-this-skill-users-beorn-code.md` |
| 3 | 25,591 | `raw/chats/2026-03-09T1130-implement-the-following-plan-silvery-migration-pla.md` |
| 4 | 23,689 | `raw/chats/2026-03-21T2323-for-termless---do-we-have-a-way.md` |
| 5 | 20,846 | `raw/chats/2026-04-08T1702-you-re-resuming-work-from-another-session-that.md` |
| 6 | 17,556 | `raw/chats/2026-03-22T2258-check-https-code-claude-com-docs-en-channels-refer.md` |
| 7 | 17,452 | `archive/Asana/@bjørn-stabell.md` |
| 8 | 16,071 | `raw/chats/2026-04-03T1619-i-have-a-huge-project-for-you-km-silvery.md` |
| 9 | 13,606 | `raw/chats/2026-04-06T0936-base-directory-for-this-skill-users-beorn-code.md` |
| 10 | 11,337 | `raw/chats/2026-04-12T2009-base-directory-for-this-skill-users-beorn-code.md` |

## File node-count distribution

Histogram of node-count-per-file, using the ancestry walk:

| nodes/file | files | total nodes |
|---|---:|---:|
| 0 – 9 | 15,126 | 22,484 |
| 10 – 49 | 563 | 12,861 |
| 50 – 99 | 129 | 9,118 |
| 100 – 499 | 151 | 34,102 |
| 500 – 999 | 34 | 24,391 |
| 1,000 – 4,999 | 63 | 150,078 |
| 5,000 – 9,999 | 8 | 56,709 |
| 10,000 – 19,999 | 8 | 108,385 |
| 20,000+ | **5** | **134,217** |

**82% of files** have fewer than 10 nodes. **5 files** hold 24% of the vault.

## Node type breakdown

| type | item | count | % |
|---|---:|---:|---:|
| `h` | 1 (outline heading) | 181,262 | 32.7% |
| `p` | 0 (paragraph block) | 175,354 | 31.6% |
| `p` | 1 (list item) | 169,426 | 30.5% |
| `code` | 0 | 16,066 | 2.9% |
| `table` | 0 | 6,712 | 1.2% |
| `hr` | 0 | 4,845 | 0.9% |
| `quote` | 0 | 818 | 0.1% |
| `html` | 0 | 180 | 0.0% |

Roughly one-third each for headings, block paragraphs, and list items. This
mirrors the shape of a chat transcript:
`## Assistant` / paragraph / bullet-list repeated per turn.

## Depth distribution

| depth | count |
|---:|---:|
| 0 | 23 |
| 1 | 263 |
| 2 | 2,327 |
| 3 | 96,267 |
| 4 | 357,546 |
| 5 | 349,661 |
| 6 | 111,506 |
| 7 | 71,426 |
| 8 | 68,220 |
| 9 | 31,344 |
| 10 | 12,258 |
| 11 | 5,073 |
| 12 | 2,544 |
| 13 | 550 |
| 14 | 161 |

**90% of nodes sit at depth 3–7.** This matches: folder → file → heading →
sub-heading → paragraph → list-item, which is exactly a chat transcript's
shape. Depth 14 (the tail) comes from deeply-nested lists in chat bodies.

## High-duplication content

Content strings appearing 100+ times verbatim:

| count | content | likely source |
|---:|---|---|
| 57,741 | `Assistant` | chat transcript speaker label |
| 10,240 | `User` | chat transcript speaker label |
| 3,715 | `Notes` | heading — journal template |
| 1,330 | `Standing by.` | chat transcript template phrase |
| 1,087 | `reply` | chat transcript metadata |
| 987 | `Attachments` | heading — journal template |
| 794 | `Inbox 0` | journal template |
| 716 | `Anti-Patterns` | doc-section heading |
| 621 | `No response requested.` | chat template |
| 594 | `Track - 12WY/Q spreadsheet` | daily planning checklist |
| 552 | `Maybe` | task-status bullet |
| 551 | `Have my mind been wandering?` | morning-routine bullet |
| 551 | `Awareness:` | morning-routine bullet |
| 551 | `08:30 Morning routine @bjørn-stabell #routine` | morning-routine template |
| 550 | `WorkFit/Awareness: choose exercise + set alarm` | morning-routine bullet |
| 550 | `Think [[#^1198698517750910]]` | morning-routine link |
| 550 | `Have I been working on the most important tasks?` | morning-routine bullet |
| 550 | `Day plan - Asana / Calendar` | morning-routine bullet |
| 525 | `Visualize - going through day, overcoming obstacles` | morning-routine bullet |
| 490 | `Fitness/WorkFit: chose exercise` | morning-routine bullet |

The top two (68,000 rows combined) are chat transcript `## Assistant` / `##
User` headings — one heading per conversation turn. The daily-journal template
contributes ~10K rows from ~550 copies of the same 15-bullet morning checklist.

---

## Hypotheses — which caused the explosion?

Four candidates from the bead description, tested against the data:

**(a) Parser exploding one big file into many nodes** — **YES, but correctly.**
The 36,647-node `pers-prod.md` and 27,000-node chat transcripts genuinely
have that many structural elements on disk. A chat transcript of a two-hour
session has ~50 turns × ~30 blocks/turn × ~10 bullets/block = ~15K nodes.
The parser is doing what it was asked to do — these are not bugs, they're
big files. Verified by inspecting top parents: the #2–#6 "biggest parents"
are individual chat-session `## Session …` headings with 4–7K children each,
consistent with one `p`/`p-item`/`code` per turn-line.

**(b) Synthetic bookkeeping nodes** — **NO.** Previous sessions flagged "96.7%
of nodes have no fs_path" as suspicious, but that's a query artifact: `fs_path`
is intentionally only stored on file/folder root nodes (10,878 + 5,209 + 2,240
= 18,327 rows, matching file count exactly). All descendants inherit via
`parent_id` walk. When re-attributed through ancestry, only **2,318 nodes
(0.4%)** have no file ancestor — and these are board/workspace synthetic roots,
not runaway generation. No bookkeeping explosion.

**(c) Bug creating duplicates** — **NO.** The duplicated content strings
("Assistant" × 57,741, "User" × 10,240) are *different nodes with identical
text*, not the same node replicated. Each lives under its own parent in a
different transcript file. The duplication is at the *source content* level
(the user has imported 2,000+ chat transcripts, each of which starts every
turn with "Assistant" or "User"), not at the *node* level. Counts match
expectations: 57,741 / ~2,000 transcripts ≈ 29 turns/transcript, plausible.

**(d) Real content at unusual scale** — **YES, dominantly.** The vault has
accumulated:
- 2,000+ chat-session transcripts exported as one `.md` per session
- Years of daily journals with a 15-bullet morning-routine template
- A legacy Asana export turned into two multi-megabyte files

This is the real root. km's model and parser are correct; the *user input
shape* is the explosion. The vault is **doing what we designed**, on data
we didn't imagine would live in the tree.

---

## What this means for the data model

The model itself is sound. Three observations that matter for forward work:

1. **Nothing requires fixing in `@km/markdown` or `@km/storage`.** Round-trip,
   type breakdown, depth distribution, and embed counts all look healthy.
   There is no divergence between items and blocks; `item=1` / `item=0` split
   is ~63/37 as expected.

2. **The "everything is a node" philosophy costs less than we feared, except
   for import-heavy directories.** 17,500 of 18,327 files have < 100 nodes.
   The issue is a *long tail of extreme files*, not a systemic per-file
   problem. Fix the extremes, leave the rest.

3. **CRDT direction is not threatened by this.** Event-sourcing-lite works
   fine at this scale if we segment by file. What doesn't work is loading
   *everything into one hot reactive tree*. We need view-level laziness,
   not a schema rewrite.

---

## Remediation direction

Ordered from smallest-impact to largest. Recommend stacking (1) + (2) + (3);
defer (4)–(5) until we see whether (1)–(3) resolve the downstream board-mount
perf issue.

### 1. Treat `raw/chats/` as opaque content by default (biggest win, 70% drop)

`raw/chats/` is an import sink for Claude Code session transcripts. The user
doesn't edit these inside km's outline — they're read-only archives,
occasionally grepped. Two concrete options:

- **Collapse-parse**: add a folder-level rule `km.collapse-parse: true` (or
  `fstype: "archive"`) that causes the loader to store each file as a single
  `mdfile` node with `content` holding the raw markdown, plus a derived title
  — no descendant nodes, no heading tree, no list items. FTS still works (it
  indexes `content`). Wikilinks can still be extracted into `links` without
  materializing nodes.
- **Skip-parse**: same idea but the file is an opaque blob until *first opened*,
  at which point it's parsed on demand. Falls out of any `@km/tree` walk until
  explicitly requested.

Either approach drops **~390K nodes (70%)** on this specific vault, taking us
from 555K to ~165K nodes. That's comfortable for the board-mount traversal and
most memory-bound queries. The mechanism is essentially the "node-count budget
with on-demand expansion" strategy (c) from the bead description, but applied
**per-folder** rather than per-file — easier to configure, easier to reason
about.

Implementation anchor: `packages/km-storage/src/markdown/pipeline.ts` and the
`parsed` flag already exist for exactly this purpose (deferred parsing). Extend
the loader to honor a `km-collapse-parse` or `.kmignore-parse` marker at the
folder level. Don't write any code yet — put the design into
`docs/design/model/collapse-parse.md` and validate.

### 2. Collapse the two Asana mega-files (another ~18% drop)

`archive/Asana/stabell/bjørn/pers-prod.md` (37K nodes) and
`archive/Asana/@bjørn-stabell.md` (17K nodes) are migration artifacts from a
one-off export. Same treatment as (1): mark `archive/Asana/` as
collapse-parse. Together with (1) this gets us to **~50K nodes**.

### 3. Daily-journal template is a normalization opportunity, not a fix (minor)

The morning-routine template contributes ~11K duplicate-content nodes. This
is expected user behavior (they *want* the same checklist every day), but it
shows that identical-content bullets share no structure beyond the string.
We should *not* change this — deduping templated content would break the user's
ability to mark one day's "Think [[…]]" differently from another's.

Keep the observation: if the eventual CRDT layer wants to hash-address content
for peer sync, it'll pay for itself here.

### 4. Defer: schema change

There is no schema change that would help. The nodes table is well-indexed
(13 indexes, all useful). The 770MB DB is mostly FTS5 overhead (content
strings appear in both `nodes.content` and `nodes_fts.content`). That's the
cost of search; it doesn't impact tree traversal.

### 5. Defer: event-sourcing / CRDT migration

This is the right long-term direction (memory `storage-crdt-direction.md`),
but the node-explosion problem doesn't make it more urgent. If (1)–(2) bring
the working-set to ~50K nodes, the TUI's performance problem for the board
view (`km-tui.board-mount-n-traversal`) shrinks dramatically. Event-sourcing
work should proceed on its own timeline, driven by sync requirements, not
by this bead.

---

## Recommended next step

**Design `km-collapse-parse` folder-level rule**. Extend `packages/km-storage/`
with a per-folder configuration that causes the loader to store files as
opaque `mdfile` stubs (title + content, no descendant parse) unless explicitly
opened. Set `raw/chats/` and `archive/` as collapse-parse by default in a
sensible built-in ignore list; expose an override in `.km/config.toml`. The
scaffolding (`parsed=0` flag, `pipeline.ts` deferred path, stub files) all
exists — this is plumbing, not a new mechanism.

Re-run this diagnostic after the change lands; expected result is total-node
count in the 50–80K range, which unblocks the perf work downstream.

---

## Post-implementation measurement — 2026-04-21

Shipped: `feat(km-storage): collapse-parse rule` (commit `e2f3eee33`) +
verification tooling (`8402edba5`). Measured against a fresh memory-mode
load of `~/Bear/Vault` (bypassing the cached `changes.jsonl`, which
contains historical parse events that would mask the effect):

| Pass | Total nodes |
|---|---:|
| before (no collapse-parse) | **540,496** |
| after (`raw/chats/**` + `archive/**`) | **65,682** |
| **reduction** | **87.8%** |

Top-level attribution after collapse-parse:

| top-level | nodes | % |
|---|---:|---:|
| `ref/` | 25,696 | 39.1% |
| `journals/` | 12,236 | 18.6% |
| `projects/` | 9,149 | 13.9% |
| `.jj/` | 3,760 | 5.7% |
| `@inbox/` | 3,731 | 5.7% |
| `.claude/` | 2,581 | 3.9% |
| `areas/` | 2,522 | 3.8% |
| `archive/` | 1,836 | 2.8% |
| `(top-level file)` | 1,571 | 2.4% |
| `raw/` | 226 | 0.3% |

`raw/` and `archive/` collapse from 68% + 20% of the vault down to 0.3%
+ 2.8% respectively. The residuals are folder nodes + stub entries for
each collapsed file — intentional, needed to preserve navigation.

Enable with `.km/config.yaml`:

```yaml
collapseParse:
  patterns:
    - "raw/chats/**"
    - "archive/**"
```

Or pass an explicit matcher via `loadRepo({ collapseMatcher })`.
Backward compat: default behavior unchanged when the key is absent.

Files promote to fully-parsed on first navigation via the existing
`parseStubFile` path — no new mechanism needed. See
`packages/km-storage/src/markdown/collapse-parse.ts` for the matcher
contract and `packages/km-storage/tests/collapse-parse-discovery.test.ts`
for the integration tests.

The bead (`km-storage.vault-node-explosion`) closes on this evidence.

---

## Post-implementation measurement — C3: collapsed-file link edges (2026-04-21)

Shipped: `feat(km-storage): collapsed_file_links schema + discovery wiring`
and the backlink-query UNION. After the C2 node reduction (555K → 66K),
C3 walks collapsed files with a lightweight regex pass and records
outgoing link edges in a new `collapsed_file_links` table.

Measured against the same `~/Bear/Vault` (memory-mode, collapse-parse
enabled with `raw/chats/**` + `archive/**`):

| Metric | Value |
|---|---:|
| Nodes | 65,685 |
| Parsed-node edges (`links`) | 4,048 |
| Collapsed-file edges (`collapsed_file_links`) | **42,135** |
| Collapsed files contributing edges | 248 |
| UNION backlink query (top target) | **0.133 ms** |

By link type:

| type | count |
|---|---:|
| wiki | 34,175 |
| md | 7,960 |

Top 10 targets by collapsed-source fan-in are dominated by Obsidian
block refs (`km:^703648229286920`, etc.) from chat-transcript internal
linking, plus a handful of doc files (`beads.md`, `workflows/*`,
`create.md`). Only ~0.3% of collapsed edges currently resolve to a
named node — the rest are block refs whose targets don't exist as
stand-alone nodes in this particular vault. The shape is expected:
chat transcripts cite their own history heavily; resolution against
the current tree will grow naturally as more of the vault gets parsed.

The edge-recovery number itself is the win: without this pass, those
42,135 outgoing links from collapsed sources would be invisible to
every backlink query. The UNION adds them back at 0.133 ms/query —
well within interactive-latency budgets.

Artifacts:
- `scripts/measure-collapsed-file-links-real-vault.ts`
- `packages/km-storage/src/markdown/extract-links.ts`
- `packages/km-storage/src/db/collapsed-file-links.ts`

The bead (`km-storage.collapsed-file-links`) closes on this evidence.

---

## Appendix — running the diagnostic

```bash
# Default: reads ~/Bear/Vault/.km/state.db (or pass --db <path>)
bun scripts/vault-diagnostic.ts --markdown > report.md

# Plain-text for quick terminal inspection
bun scripts/vault-diagnostic.ts

# JSON for further analysis
bun scripts/vault-diagnostic.ts --json > report.json
```

Read-only — opens the DB with `readonly: true`. Takes ~4 seconds on this vault.
Copy the DB to `/tmp/` first if the live vault might be writing concurrently
(the WAL file must be copied alongside for the snapshot to be consistent).
