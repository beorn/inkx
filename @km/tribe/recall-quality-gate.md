---
id: "@km/tribe/recall-quality-gate"
aliases:
  - km-tribe.recall-quality-gate
  - km-tribe-recall-quality-gate
created_by: claude:7e9436e8
created_at: 2026-04-21T20:35:09Z
closed_at: 2026-04-27T08:24:58Z
close_reason: "Landed via tribe-refactor team (compose, qualgate, bgrecall,
  events agents in parallel worktrees). All acceptance criteria verified: bearly
  tests 983/983 pass, 0 non-vendor non-silvery-WIP tsc errors. Bearly tip
  655f11a; km integration commit 5de018cf7 (already on origin/main per
  parallel-session merge). Companion km commits: 34f07d080 (qualgate accountly
  export-path gate), a0c9bfb5b (compose hub doc cleanup), f4e8fac6a (bgrecall
  worktree commit, integrated). See km-tribe.refactor for epic close +
  integration details."
---

# [x] Recall quality gate — reject corrupted/decayed/stuck-loop sessions at index + query time @km/tribe #bug #P1 @claude:87d20187

blocks:: [[@km/tribe]]

# The bug

vault-2 reported UserPromptSubmit additionalContext contained three distinct corruption classes simultaneously:

- **Cross-session concatenation**: fragments from unrelated sessions joined mid-sentence (prompt-injection research + naming review + "Delei's lunchmoney, Arthur's Gmail" cut off)
- **Degraded-LLM output indexed as real content**: grammatical decay, e.g. "upstream/ yarn versions are currently supported by current upgrades. ports and maybe for other situations / testing in the same of the same"
- **Stuck-loop decode**: "so back to the vault reorg!" × ~40 verbatim repeats written to disk + indexed

Failure mode is at the data layer, not the injection-defense layer. The envelope library's sanitize() strips XML-ish tags but does no quality analysis. Pointer mode (post-phase-3) reduces symptom severity by hiding bodies but still surfaces the bad doc as a relevant pointer. Structural @km/_orphan/ambot gates are orthogonal.

## Scope

Files to touch:

- `vendor/accountly/src/recall.ts` — session export path. This is what writes the JSONL→markdown chats that qmd indexes.
- `vendor/bearly/plugins/recall/` — the direct `bun recall` CLI + its pointer-mode default state (vault-2 notes accountly is pointer-default, bearly CLI may still be snippet-default — audit + promote to match).
- Whatever qmd-indexer runs over those markdowns (might be out-of-tree in qmd itself).

## Acceptance

- [ ] **Immediate purge**: one-shot script scanning existing `~/Bear/Vault/raw/chats/` for corrupted docs and quarantining them to `raw/chats-quarantine/` (doesn't delete — reversible). Patterns: same line repeated ≥10 times contiguous; >70% of sentences < 4 words; single 4-gram repeating ≥5 times in a doc.
- [ ] **Index-time quality gate**: add a filter in the export path that rejects or flags-low-quality any doc matching the above patterns BEFORE it gets written to raw/chats/. Flagged docs go to a `raw/chats-rejected/` sibling dir with a `.reason` sidecar file, not into qmd's indexed collection.
- [ ] **Query-time backstop**: in accountly's `cmdHook()` (after qmd returns hits), run the same quality filter over each hit's content; drop failures. Cheap lexical check, no LLM. This covers the case where the gate was added after some bad docs slipped in.
- [ ] **Promote bearly recall CLI to pointer-mode default**: if `bun recall` still emits snippets, flip default to pointer. `--snippets` flag for legacy. Matches accountly behavior post-phase-3.
- [ ] **Tests**: adversarial fixtures for each corruption class; both gates (index + query) must reject.

## Design notes

- Stuck-loop detection: check whether the most common N-gram (N in {4,8,16}) covers >20% of total tokens. Yes → reject.
- Grammatical decay: heuristic on average sentence length + punctuation-to-word ratio + stopword density. Degraded output has distinctive low stopword density and high short-sentence ratio. Won't catch everything, catches this class.
- Cross-session concatenation: harder — suggests a bug in the export path itself, where two separate sessions got joined. Investigate `exportSession` / file-writing path for append-without-close or similar.

## Relation to @km/_orphan/ambot

Same 'bad data reaching the model' family, different cause. @km/_orphan/ambot was about non-user content conflated with user intent. This is about corrupted content getting treated as real content. The envelope library + authority gate do not handle this — they defend against malicious-but-coherent injection, not decayed-or-broken content. Fix lives upstream at the indexer.