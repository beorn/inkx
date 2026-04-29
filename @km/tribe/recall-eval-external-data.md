---
id: "@km/tribe/recall-eval-external-data"
aliases:
  - km-tribe.recall-eval-external-data
  - km-tribe-recall-eval-external-data
created_by: claude:4de4a3ab
created_at: 2026-04-28T07:07:13Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tribe.recall-eval-external-data
    depends_on_id: km-tribe.recall
    type: parent-child
    created_at: 2026-04-28T00:07:12Z
    created_by: claude:4de4a3ab
    metadata: "{}"
  - issue_id: km-tribe.recall-eval-external-data
    depends_on_id: km-tribe.recall-eval-corpus
    type: blocks
    created_at: 2026-04-28T00:07:13Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [ ] Eval: external-data integration (beads/docs/commits surfaced from conversation context) @km/tribe #task #P2

blocks:: [[@km/tribe/recall]], [[@km/tribe/recall-eval-corpus]]

# Why

LongMemEval, LoCoMo, and the rest of the published memory benchmarks only test \"did you remember what was said in past conversations.\" km is broader — the recall system pulls from external substrates the user never explicitly told the assistant:

- Beads (issue tracker, evolves)
- qmd / markdown knowledge base (design docs, vault notes)
- Code repo state (commits, file changes, branch state)
- Ambient streams (file watch, CI, tribe broadcasts)
- Future: LSP / project semantics

There's no public benchmark for \"given conversation context X, did the system surface the right external artifact Y?\" because nobody else has tried integrating these.

This bead is a sibling test axis to @km/tribe/recall-eval-corpus. The corpus measures **conversational** retrieval; this bead measures **external-data integration**.

# What

Pairs of \`(conversation_prefix, expected_external_artifact)\`:

\`\`\`yaml
- id: ext-pair-001
  conversation_prefix: |
    [USER] why did we decide to use Yoga over a custom flexbox?
    [ASSISTANT] (debugging context...)
  expected_artifacts:
    - kind: doc
      path: hub/flexily/design/yoga-decision.md
    - kind: bead
      id: km-flexx.yoga-vs-custom
  notes: \"Q is about an architectural decision. Right answer is the design doc + the bead, not a past conversation.\"

- id: ext-pair-002
  conversation_prefix: |
    [USER] this column wrap thing keeps breaking
  expected_artifacts:
    - kind: bead
      id: km-tui.column-wrap-N>5
    - kind: commit
      sha: abc123  # the prior fix attempt
  notes: \"Q is about a recurring bug. Right answer is the bead history + the prior fix commit, not just past conversation.\"
\`\`\`

# Acceptance

- ≥20 labeled (conversation_prefix → expected_artifacts) pairs in hub/tribe/eval/external-corpus.yaml
- Runner extension that scores per-artifact-kind (\"did we surface the right bead? the right doc? the right commit?\")
- Acceptance gate for downstream beads: each variant (salience-trigger / multipath-rrf / cognitive-rerank) must not regress external-data precision while improving conversational

# Depends on

@km/tribe/recall-eval-corpus (extends the same runner; can co-evolve)

# Why this matters strategically

If the published memory systems are measuring \"can your agent remember a conversation,\" km is measuring \"can your agent integrate context from a working knowledge worker's environment.\" The two are different problems. Our novel contribution is the second axis. We can't argue it without measuring it.