<!-- llm-meta: {"model":"dual-pro (GPT-5.4 Pro + Kimi K2.6)","session":"8b5b9e1c","timestamp":"2026-04-22T06:00:54.637Z","query":"Final check on km storage docs + beads — under 600 words, bullet-heavy. Catch remaining contradictions, wrong-scope beads, hidden cycles, doc/bead mismatches, anything obvious to kill. If nothing substantive, say 'ship it.'","cost":"$1.30","tokens":40309,"durationMs":279166} -->

# Dual-Pro Response

**Question**: Final check on km storage docs + beads — under 600 words, bullet-heavy. Catch remaining contradictions, wrong-scope beads, hidden cycles, doc/bead mismatches, anything obvious to kill. If nothing substantive, say 'ship it.'

**Models**: GPT-5.4 Pro + Kimi K2.6
**Total cost**: $1.30 ($1.27 + $0.035)

---

## GPT-5.4 Pro
_19947 tokens · 279s · $1.27_

A few small but real nits; otherwise **ship it**.

- **Remaining doc contradiction**
  - In **§8 / P3 step 4**, you still say watcher echo suppression is **“hash-compare only.”**
  - **§7.4 now says the real design is `mtime+size` fast-path, then hash compare.**
  - Fix that one line so the sequence matches the actual policy/code reality.

- **Wrong-scope beads**
  - **`km-tree.outliner-reshape`** → move out of `km-storage`.
  - **`km-tree.refs`** → move out of `km-storage`.
  - **`parse-stub-links-gap`** is *probably* also wrong-scope unless you know it is specifically a storage/index invalidation bug. Name reads like refs/link-resolution, not storage architecture.

- **One stale/superseded bead to kill**
  - **`automerge-store`** should be **closed/superseded now** by `km-storage.pathway-db-crdt`.
  - Leaving it open creates a false parallel roadmap and directly conflicts with the doc’s “old Phase 6 CRDT plan is superseded” reality.

- **Ordering / dependency nits**
  - Add an explicit dependency: **`writeback-cas` depends on `markdown-fidelity-corpus`**. The doc says this clearly; the graph should too.
  - I would also add: **`writeback-cas` depends on `fs-mount`** (or make it a child), since §6.3 says safe writeback is owned by `@km/fs-mount`.
  - **`federation` should not look P1-ready**. Doc sequence puts it later/orthogonal. At minimum:
    - lower its priority back down, or
    - add blockers on **`identity-schema`** (`RepoId`) and **`fs-mount`** (`FsMount` boundary).
  - If **`typed-event-categories`** is needed for the targeted invalidation promised in `lazy-hydration` (`backlinksState` + commit delta), make that dependency explicit. If not, fold it into `lazy-hydration` and delete the standalone bead.

- **Doc ↔ bead mismatch**
  - §11’s “Current bead tracking” shows only the architecture path, but the actual open tree also includes:
    - `typed-event-categories`
    - `remove-skipfssync`
    - `parse-stub-links-gap`
    - `automerge-store`
  - Not fatal, but it creates “is the doc incomplete or are these out-of-band?” ambiguity.
  - Easiest fix: one sentence in §11 saying **“architecture tracker only; bugs/cleanup beads omitted”** — then move the wrong-scope ones out.

- **One simplification I’d do**
  - **Kill `automerge-store`** rather than carrying both that and `pathway-db-crdt`.
  - If you want one more cleanup: make **all FS-write-path work** (`fs-mount`, corpus, writeback-cas) visually a single subtree. Not required, just cleaner.

**Bottom line:** one wording fix, three likely reparent/close actions, and a couple explicit blockers. After that: **nothing substantive — ship it.**

---

## Kimi K2.6
_20362 tokens · 98s · $0.035_

- **Reparent `km-tree.outliner-reshape` and `km-tree.refs`**. They are tree/outliner UX, not storage mechanics. Move both under the `km-tree` scope epic.

- **Fix the P1/P3 priority mismatch in §8**. `markdown-fidelity-corpus` and `writeback-cas` are tagged `[P1]` in beads/§11, but §8’s implementation sequence labels that whole work package **P3**. If you accelerated them intentionally, update §8’s headings; otherwise drop the beads to P3 to match the doc.

- **Add missing open beads to §11**. `parse-stub-links-gap`, `remove-skipfssync`, and `typed-event-categories` are open in the tree but absent from the doc’s bead inventory. Include them or close them.

- **Clarify the `writeback-cas` dependency**. The bead description implies corpus → serializer → CAS ordering, yet `markdown-fidelity-corpus` is nested under `fs-mount` while `writeback-cas` sits as a sibling. Not a cycle, but the dependency is implicit. Make it explicit (e.g., parent `writeback-cas` → corpus child, or a “blocked by” note).

- **Kill `typed-event-categories`**. It is pure architectural taxonomy (structural vs update vs read-only events) with no mention in the doc and no concrete bug driving it. It is P3 speculation; reopen only when an actual event-routing pain point forces the distinction.

Nothing else substantive. Ship it.