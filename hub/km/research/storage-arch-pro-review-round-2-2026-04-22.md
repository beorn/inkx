<!-- llm-meta: {"model":"dual-pro (GPT-5.4 Pro + Kimi K2.6)","session":"8b5b9e1c","timestamp":"2026-04-22T00:06:29.528Z","query":"Review round 2 of km's storage architecture. I want critique, not validation. Is it internally consistent? Is the FS-truth-now-DB-truth-later framing honest or hedging? Does the reconciliation model (§3) handle common offline-edit scenarios? Are the sync tiers (§9) well-separated? What would bite a solo dev with 3-6 months executing this?","cost":"$0.047","tokens":18297,"durationMs":335672} -->

# Dual-Pro Response

**Question**: Review round 2 of km's storage architecture. I want critique, not validation. Is it internally consistent? Is the FS-truth-now-DB-truth-later framing honest or hedging? Does the reconciliation model (§3) handle common offline-edit scenarios? Are the sync tiers (§9) well-separated? What would bite a solo dev with 3-6 months executing this?

**Models**: GPT-5.4 Pro + Kimi K2.6
**Total cost**: $0.047 ($0.00¢ + $0.047)

---

## GPT-5.4 Pro
⚠️  Failed: Response failed

---

## Kimi K2.6
_18297 tokens · 336s · $0.047_

This document has improved materially since round 1, but it still carries the scars of too many rewrite passes. It is **not yet internally consistent**, the **FS/DB flip is hedging dressed up as roadmapping**, and the **cost estimates are dangerous fantasies** for a solo dev. Below is the critique you asked for.

---

## 1. Internal inconsistencies (the doc fights itself)

**Duplicate section numbering.** You have two §1.1s and two §1.2s. The second §1.1 ("The load-bearing invariant") and §1.2 ("What 'identity' means...") appear to be orphaned headers from an earlier cut that weren't renumbered. That alone signals the document hasn't been read end-to-end in one pass.

**Frontmatter key order contradicts itself.**
- §1.0: "Frontmatter YAML (values preserved; **key order is normalized, not preserved**)"
- §7.2: "Serializer preserves what it doesn't touch: [...] **Frontmatter key order**"

Which is the requirement? If the AST normalizes key order, the serializer cannot preserve it. If the serializer preserves it, the AST is lossy on parse. You need to pick: either the AST stores key order (making it richer), or you drop the claim from §7.2.

**File `.name` is ambiguous vs. wiki-link resolution.**
- §2.2 shows a file node with `name="notes/foo"` (full repo-relative path).
- §2.3 says File `.name` is "derived from filename (path stripped of `.md`)" — which for `repo/notes/foo.md` could be `notes/foo`.
- But §2.2's resolution example says `[[foo]]` → `[file:"foo"]`.

If the file's canonical `.name` is `notes/foo`, then `[[foo]]` must resolve via **basename search**, not direct `.name` lookup. But §3.2 says File match is by "repo_id + path" (not basename). This collapses the entire "path-of-`.name`" model for files if wiki-links don't use the same identifier. Is `[[foo]]` hitting a basename index, or is the file's `.name` actually just `foo`? Clarify whether file names are basenames or repo-relative paths, because the reconciliation primary key depends on it.

**`#` and `^` resolution claim to share a path, which is not Obsidian-native.**
§2.5 says `[[file#rec]]` and `[[file^rec]]` hit the same resolution path. In Obsidian, `#` denotes headings and `^` denotes blocks. They are different namespaces. If km treats them as identical, you are **not** Obsidian-compatible — you are km-compatible. If this is intentional, flag it as a deliberate divergence. If it's accidental, fix it.

**Diff-chunk similarity is both "future upgrade" and "rejected."**
- §3.5: "Future upgrade if real-world pressure demands: diff-chunk similarity"
- §9 Rejected list: "**Diff-chunk similarity for rename+edit** — rejected"

Pick one.

---

## 2. "FS-truth now, DB-truth later" is hedging

The framing is **dishonest in its confidence**. You write, "The question is WHEN, not IF" and list triggers that make the flip sound inevitable. But then you claim the flip is cheap (~300–400 LOC refactor). Those two beliefs are incompatible. If it's truly inevitable and cheap, you should either do it now or admit you don't know if you'll ever do it.

**The triggers are weak:**
- "A feature ships that can't be represented in AST → markdown" — but §1.0 **already** gives you an escape hatch for this: "store it as DB-only state (never serialized to `.md`)." That is a fully valid FS-truth design. It does not force a flip.
- "Multi-file atomicity under FS-truth becomes a maintenance burden" — you are already signing up for that burden with §7.3's journal. If the journal is good enough to ship, it's good enough to keep. If it's not good enough, you shouldn't be building it.

**The ingest pipeline claim is false.**
You say: "the ingest pipeline under FS-truth IS the ingest pipeline under DB-truth — identical shape." This is wrong. Under FS-truth, the watcher drives the system: FS event → parse → DB update. Under DB-truth, the user/command drives the system: DB transaction → project → FS write. The watcher becomes a backup/sync mechanism, not the primary ingress. The shape inverts.

**The policy contradiction is unresolved.**
- §1.2 (Policy statement): "**On conflict, FS wins.** External edits are trusted; km's in-flight DB state is disposable."
- §1.1 (prerequisites for flip): DB-truth requires "versioning + backup + rollback" to match FS-truth's trust properties.

But if FS wins today, and DB will win tomorrow, every feature you build between now and then is built on a mental model you plan to discard. That is not "pragmatism" — it is **building on sand**. A cleaner formulation:

> "FS-truth is the architecture. We will not flip to DB-truth unless and until a shipping feature is impossible without it. If that day comes, we accept that the refactor will be large and will require a v2 migration. We are not architecting for that day today."

Drop the cost estimates and the "WHEN, not IF" language. They serve no purpose except to make you feel better about future-you's problem.

---

## 3. The DB-truth flip is not cheap, and the prerequisites are incomplete

Your estimate of **300–400 LOC refactor + 500–800 LOC versioning** is off by roughly an order of magnitude for a solo dev. Changing the source of truth touches:

- **Write path inversion**: Every edit operation today assumes "mutate AST, serialize to FS, FS event updates DB." DB-truth means "mutate DB, project diff to FS." That's not a refactor — it's a rewrite of the command layer.
- **Conflict resolution becomes the default**: Under FS-truth, conflicts are rare because FS wins. Under DB-truth, every external FS change (git pull, Obsidian edit) is a concurrent modification that must be reconciled against DB state. You are signing up for **three-way merge as a core user experience**, not an edge case. That needs UI, algorithm, and testing.
- **Migration bootstrap**: On flip day, existing users have `.md` files that are truth. You must ingest them into a DB that is now truth. That migration is a one-way door that must be perfect.
- **Mental model migration**: "Your markdown is now a projection" is a product earthquake. It needs documentation, UI affordances, and likely a format/version flag in `.km/config.toml`.

**Missing prerequisites:**
- **Conflict resolution UX spec**: What does the user see when Obsidian edits a file while km has unsaved DB state? Under FS-truth, you discard DB. Under DB-truth, you must surface a merge. You have no spec for this.
- **FS projection strategy**: Will you project the entire DB to `.md` on every commit? Only dirty files? How do you handle deletions? This is a sync protocol you haven't designed.
- **DB query-to-FS-patch mapping**: Today, SQLite is a cache. Under DB-truth, queries drive the file tree. The mapping from relational/graph data back to hierarchical markdown files is non-trivial (e.g., a block referenced in two places — which file owns it?).

**Recommendation**: Delete the cost estimates entirely. They will mislead you into thinking the flip is a "sprint" when it is a "quarter."

---

## 4. Reconciliation (§3) has gaps for offline edits

**The primary key is solid for the happy path**, but secondary heuristics are under-specified in ways that will bite during implementation.

**Undefined "content hash" scope.**
§3.3 says content hash is "sha256 of bytes" and applies to "rename/move detection." Is this **file-level** bytes or **node-level** bytes? If a user splits a file, blocks move to a new parent. If content-hash is file-level, it can't match the moved blocks. If it's node-level, you need to define the canonical serialization of a node for hashing (AST? Markdown substring?). This is not a trivial omission — it determines whether split/merge is detectable.

**"Structural similarity" is hand-waving.**
You list it as a heuristic with "Weak; may misattribute" signal strength, but you do not define it. For headings, is it Levenshtein on text? For blocks, is it Jaccard on lines? For a solo dev, "implement structural similarity" is an open research problem, not a ticket. Either define it concretely or drop it and accept that rename+edit is always delete+new.

**Offline scenario: block move across files.**
A user cuts a paragraph with `^abc` from `foo.md` and pastes it into `bar.md` in Obsidian, then git-pulls on another machine.
- Primary match in `foo.md` fails: `^abc` is gone.
- Primary match in `bar.md` fails: parent_file_id changed.
- Content-hash (if node-level) might match.
- But §3.7 says "For blocks WITH `^abc` labels, identity is by literal string match — not hash, not similarity. Can't accidentally collide."

This is only true **within a file**. Across files, your heuristics *can* misattribute it, or more likely, will treat it as a new node in `bar.md` and a deletion in `foo.md`. That's acceptable, but §3.7's "Can't accidentally collide" claim is too strong. It should be scoped: "Collision-free within the original parent scope."

**Offline scenario: heading reorg without anchor.**
User moves `## My Heading` from `foo.md` to `bar.md` via cut/paste. It has no `^anchor`, so `.name` is slug `my-heading`.
- In `bar.md`, primary match fails (wrong parent_file_id).
- Falls through to structural similarity? Content hash? Position?
- Most likely: new ULID in `bar.md`, dead link in `foo.md` (if any). This is the same as Obsidian, so it's honest, but you should state explicitly that **cross-file heading moves without anchors are unrecoverable**.

**Missing: directory rename.**
If `notes/` is renamed to `archive/`, every file's path changes. Your file-level content-hash/inode detection handles the files, but what about the directory node itself? Does km model directories as nodes? §2.2 shows directories in the tree, but §2.3 only defines names for files, headings, blocks, and tags. If directories are nodes, they need a `.name` rule too.

---

## 5. Sync tiers: Tier 1 is probably dead weight

**The tiers are conceptually okay, but Tier 1 is poorly motivated.**

Tier 0 is "git." Tier 1 is "git + `.km/identity.toml` tracked." What does the sidecar actually solve that Tier 0 doesn't?

- **Renames**: Tier 0 + content-hash/inode already handles renames within a peer. Across peers, if I rename `foo.md` → `bar.md` and you rename it → `baz.md`, the sidecar has a merge conflict. Without the sidecar, both peers reconstruct via hash. The sidecar **adds** a conflict surface without clear benefit.
- **Empty files**: Content-hash is useless for empty files. Is that the motivation? If so, say so.
- **Duplicate content**: If two files are byte-identical and one is renamed, hash can't distinguish them. Inode can (within a filesystem), but not across peers. A sidecar mapping `content_hash → ULID` would help here. But that's not what you described.

**My verdict**: Tier 1 is a complexity trap. Skip it. Stay at Tier 0 until user pain justifies Tier 2 (op log). Tier 2 is where you actually get a sync upgrade: semantic operations instead of file-level diffs.

**Tier 2 under FS-truth is weird, though.** If FS is truth, what is the op log a log *of*? File system mutations? If so, it's just a verbose journal. If it's semantic edits (insert heading, delete block), then you are effectively building DB-truth's event sourcing without committing to DB-truth. Be honest: Tier 2 is a DB-truth gateway drug. That's fine, but call it that.

---

## 6. What will bite a solo dev executing this in 3–6 months

**A. "Minimal patching serializer" (§7.2) is a tar pit.**
You list this as one work package (P3) alongside CAS and echo suppression. Preserving whitespace, list markers, line endings, and frontmatter order while doing AST-based mutations is **extremely hard**. It is essentially building a sourcemap-aware code formatter. For a solo dev, this could consume **4–6 weeks** on its own. If you ship P3 before P5 (fidelity corpus), you risk discovering that your serializer corrupts edge cases and having to rebuild CAS on top of a new serializer.

**Fix**: Merge P3 and P5. The fidelity corpus must gate the serializer. No CAS without proven round-trip fidelity.

**B. Schema migration while P1 is in flight.**
P2 folds `block_id?` into `.name`. If P1 (lazy-hydration) is already building SQLite queries against the old schema, P2 forces a rewrite of those queries. "Orthogonal" is wrong — schema changes are never orthogonal to storage work.

**Fix**: Do the identity model (P2) **before** or **merged into** P1. Lazy-hydration should query the final schema.

**C. No test harness for reconciliation heuristics.**
§3 is a specification for a heuristic classifier. Heuristic classifiers are bug farms. Without a property-based or scenario-based test suite (generate file trees, mutate them, assert identity stability), you will spend weeks chasing "why did my cursor jump to the wrong file?" bugs.

**Fix**: P2 must include a `reconciliation-test-harness` bead that generates offline-edit scenarios (rename, edit, rename+edit, split, merge, git-pull with conflict) and asserts expected ULID stability.

**D. Multi-file journal (§7.3) is "best-effort" — which is not good enough.**
Under FS-truth, a half-applied journal is user-visible data loss (e.g., file A renamed, file B's backlinks updated, crash in between). "Best-effort + doctor" sounds fine on paper, but for a solo dev, building a resumable journal with crash recovery is a massive distraction from product features.

**Fix**: Simplify. For v1, **do not support multi-file atomicity.** Allow operations to be non-atomic across files. Rename a file → update backlinks in a second pass → if crash, user runs "doctor" which is just "rebuild backlinks index." Do not build a write-ahead log for markdown.

**E. Watcher echo suppression has three strategies and no decision.**
§7.4 lists origin cookies, short-term cache, and stateless hash-compare. A solo dev does not have time to A/B test watcher suppression. Pick **one** (hash-compare is stateless and robust; use that).

**F. The document is too long.**
At ~3,500 words, this architecture doc is a maintenance burden. For a solo dev, the architecture should fit in a single screen. Every paragraph is a promise you must keep. I would cut:
- The entire DB-truth flip speculation (§1.1, §9 "Probable future direction"). Move to a separate `km-futures.md` doc.
- The "taglines" (cute but not load-bearing).
- The detailed tier descriptions beyond Tier 0 and Tier 2.

---

## Summary verdict

| Area | Verdict |
|------|---------|
| Internal consistency | **No.** Fix duplicate sections, frontmatter contradiction, file `.name` ambiguity. |
| FS/DB framing | **Hedging.** Strip the "inevitable" language and cost estimates. FS-truth is the architecture until a feature forces the issue. |
| DB-truth prerequisites | **Incomplete.** Missing conflict UX, projection strategy, and bootstrap migration. Cost estimate is fantasy. |
| Reconciliation | **Adequate for common cases, under-specified for edge cases.** Define content-hash scope and structural similarity, or remove them. |
| Sync tiers | **Tier 1 should die.** Jump from Tier 0 → Tier 2 when needed, or stay at Tier 0. |
| Solo-dev risk | **High.** Serializer is a tar pit, schema churn is likely, and the doc promises too much. |

**One-sentence recommendation**: Throw out the DB-truth speculation, lock the identity model (§2) and reconciliation (§3) to exactly what's implementable in two weeks, and make the fidelity corpus (P5) the gate for all writeback work. Everything else is noise.