# Storage architecture session retrospective — 2026-04-22

## Arc of the session

Started as "continue /max don't stop until done" with five parallel agents already running; pivoted mid-session into a multi-hour architectural refinement of km's storage + identity layer. Ended with a v3 design doc (`hub/km/storage-architecture.md`), a named Phase A → E pathway (FS-truth → op log → DB-truth → CRDT → sync platform), and a pruned/realigned bead tree.

## What changed in the design (vs. the state at session start)

1. **FS-truth reframing**. Started with "FS-truth forever, DB-truth maybe someday." Progressed through "FS-truth now, DB-truth probable future," and ended with a concrete **named pathway** (§9 Phase A → E) with per-phase value unlocks: semantic undo (B), versioning/agent-state (C), real-time collab (D), sync platform (E).

2. **Inode elevated to primary**. After dual-pro round-2 critique + user clarification ("if we have ino we can use it — if we don't have it then of course .name"), reconciliation §3 reordered: inode (Step 1) → path-of-`.name` (Step 2) → content-hash + within-file heuristics (Step 3+). Rationale: inode is OS identity when present; `.name` is the cross-transport fallback.

3. **block_id folded into `.name`**. A heading's or block's `^anchor` *is* the name. Heading-slug falls back to content-derived. Removed the separate `block_id?` field from `KNode`.

4. **File basename vs path clarified**. Round-2 review flagged ambiguity. Split into: File `.name` = basename (Obsidian link form), `.path` = full repo-relative path (FS + disambiguation).

5. **Structural-similarity heuristic dropped**. Round-2 reviewer called it a solo-dev tar pit without a concrete definition. Moved to Deferred with concrete re-entry criteria.

6. **Minimal serializer gated on fidelity corpus**. Old P3 (CAS) could ship on an unverified serializer. New P3 = corpus → serializer → CAS, in that order.

7. **Multi-file atomicity flagged as open decision**. Reviewer recommends dropping the journal for v1. Captured as `km-storage.multi-file-atomicity-decision` for user judgment.

8. **DB-truth cost estimates removed**. Earlier drafts claimed ~300-400 LOC refactor + ~500-800 LOC versioning. Round-2 review flagged as likely off by 10x (write path inversion, three-way merge as default, bootstrap migration — product earthquakes, not sprints). Cost language removed entirely.

9. **Rust/Zig escape hatch for Phase D perf**. User added at wrap: expected escalation if JS Automerge doesn't scale; keeping the storage interface small + op-shaped makes it a swap, not a rebuild.

## What the pushback actually caught

Dual-pro round-2 critique (Kimi K2.6 delivered; GPT-5.4 Pro failed) was unusually sharp. Specific inconsistencies the doc carried after round-1 rewrites:

- Duplicate `§1.1`/`§1.2` headers (orphaned from an earlier cut)
- Frontmatter key order: `§1.0` said normalized, `§7.2` said preserved
- File `.name` ambiguous between basename and repo-relative path
- `#` and `^` claimed to share a resolution path (breaks Obsidian semantics)
- Diff-chunk similarity listed as both "future upgrade" and "rejected"
- Content-hash scope never specified (file-level or node-level — determines whether split/merge is detectable)
- `§3.7` "can't accidentally collide" claim too strong (only true within a file)

All fixable in a single pass once named. The doc had the right ideas but hadn't been read end-to-end since the last set of rewrites.

## What went right

- **Pushback followed through**. User rejected several early proposals (frontmatter injection, ID scattering, scattered hashes, definePlugin). Every rejection led to a tighter design, not a defensive retreat.
- **External review landed at the right time**. Round-1 pro review caught frontmatter-id-injection, block-hash collision math, uniform-adapter over-generalization, missing safe-writeback. Round-2 caught internal consistency drift after multiple rewrite passes. Two independent reviews, two different flavors of feedback, both useful.
- **Consolidation worked**. Started with 7 RFC/design docs; ended with 1 canonical doc + 3 research files in `hub/km/research/`. The superseded docs were deleted, not stashed.
- **User directives were sharp and load-bearing**. Every user message in this session directly changed the design. No cycles spent on arguments the user didn't care about.
- **The pathway framing ("named phases with unlocks, not scheduled work") unlocked the DB-truth debate**. Once DB-truth stopped being "probable future we're hedging about" and became "Phase C with specific unlocks," the honesty returned to the doc.

## What went wrong / what to do better

- **Doc drifted faster than it was read**. `§1.1` and `§1.2` had duplicate numbering for at least one full commit cycle before round-2 review caught it. Next time: after any major rewrite, run a quick `grep -n '^### '` and read the section index end-to-end.
- **LOC cost estimates should never have been in the doc**. The `~300-400 LOC + ~500-800 LOC` numbers looked like analysis but were speculation. Reviewer called them "fantasy" and recommended removal. Rule going forward: if we haven't actually scoped it via a spike or a written plan, don't put a number on it.
- **The fs-adapter → fs-mount rename wasn't executed on beads**. The doc says "renamed from `km-storage.fs-adapter`" but the bead is still named `km-storage.fs-adapter`. Easy to fix next session via `bd rename`, but it's current drift between doc and bead tree.
- **Tribe daemon git-lock warnings were noise**. The daemon fired repeated `held >10s/30s/40s` warnings throughout the session; `ls .git/index.lock` always returned exit=2 (no lock). Likely a liveness-check bug in the daemon. Worth filing.
- **Some multi-round rewriting was avoidable**. The block_id question went through "hash-derived" → "literal string" → "merge into .name" over three rounds, when the final answer is essentially what Obsidian already does. Could have reached it sooner by asking "what does Obsidian actually do here?" earlier. Rule: for Obsidian-compat features, check Obsidian's behavior before designing.
- **Session ran long past natural wrap points**. The user had to say "wrap up" explicitly before I stopped adding to the doc. Several of the best additions (pathway framing, Phase E, Rust/Zig escape hatch) came *after* that wrap request — good ideas, awkward timing. Next time: offer to stop after each major commit and check for new directives before continuing.

## Bead state drift noted

The v3 doc's `§11` bead table lists several beads that don't yet exist or need restructuring. This session created the most critical ones:

Created this session:
- `km-storage.pathway-db-crdt` (P3, parent `km-all.plateau`) — Phase A→E tracker
- `km-storage.identity-schema` (P0, parent `km-storage.adapter-architecture`) — blocks lazy-hydration
- `km-storage.reconciliation-harness` (P1, parent `km-storage.fs-adapter`, blocks fs-adapter)
- `km-storage.lazy-hydration` (P0, parent `km-storage.adapter-architecture`, depends on identity-schema)
- `km-storage.multi-file-atomicity-decision` (P1, parent `km-storage.writeback-cas`)

Deferred to next bead-reshape session:
- Rename `km-storage.fs-adapter` → `km-storage.fs-mount` (doc uses new name)
- Supersede `km-storage.crdt-trigger` under `km-storage.pathway-db-crdt`
- Review whether `km-storage.adapter-architecture` epic title still fits now that "adapter" was dropped in favor of concrete `FsMount`

## Recommendations for the next storage session

1. **Pick a Phase A first-step and commit**. P0 (identity schema migration) is the blocker; it's 1-2 days; do it first. Don't accumulate more architecture without execution.
2. **Make the multi-file-atomicity decision**. It's blocking P3 design and it's a yes/no question. My recommendation: ship v1 without the journal.
3. **Run `bd rename` + supersession pass** to align bead tree with v3 doc.
4. **If anything in Phase A reveals a Phase B/C/D/E dependency**, note it in the pathway bead immediately. The pathway bead is the place to record "this Phase A decision leaves us a cleaner Phase C exit."
5. **Don't re-open the architecture doc** unless a Phase A task surfaces a genuine unknown. The doc is v3; further edits should be minor + evidence-driven.

## Handoff note

The storage architecture is now in a state where execution can start. Phase A is fully specified in `§8`. The pathway to Phase E is named but not scheduled. External reviews are archived in `hub/km/research/`. Session ended with no uncommitted work.
