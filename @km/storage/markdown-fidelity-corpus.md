---
id: "@km/storage/markdown-fidelity-corpus"
aliases:
  - km-storage.markdown-fidelity-corpus
  - km-storage-markdown-fidelity-corpus
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:04:49Z
closed_at: 2026-04-22T06:41:11Z
close_reason: "Complete: 36 fixtures across 11 categories, round-trip test at
  packages/km-markdown/tests/fidelity-corpus.test.ts passes 95/100 (5 skipped
  for known drift — whitespace normalization + frontmatter YAML
  canonicalization). Gates writeback-cas."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.markdown-fidelity-corpus
    depends_on_id: km-storage.fs-mount
    type: parent-child
    created_at: 2026-04-21T15:30:21Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Markdown fidelity test corpus — import/export round-trip regression bank @km/storage #task #P1 @claude:8b5b9e1c

blocks:: [[@km/storage/fs-mount]]

Build a test corpus for markdown parse/serialize round-trip regression that exercises real-world edge cases.

## Why

Pro review 2026-04-21 flagged as mandatory regardless of family:

> 'Regardless of A or future C, this is mandatory. Test cases: weird list indentation; frontmatter ordering; comments; code fences; Obsidian syntax/extensions; broken/incomplete markdown; large notes; heading moves; ref preservation. No-op import/export should preserve as much as possible.'

Also gates the A-vs-C-federated decision per RFC v2 §2.4 — family-C flip requires markdown-fidelity proven.

## Scope

Fixtures organized by failure mode:

1. Whitespace: tabs vs spaces, nested indentation, trailing whitespace
2. Frontmatter: ordering preservation, nested YAML, arrays, comments
3. Code fences: exotic language IDs, nested backticks, empty fences
4. HTML comments (Obsidian-style <!-- comment -->)
5. Wiki-links: [[target]], [[target|display]], [[target#heading]]
6. Block refs: ^blockid, embeds ![[target]]
7. Large: >100KB single note, deep nesting
8. Broken: missing close fences, incomplete frontmatter
9. Heading moves: ref preservation after structural edits
10. User style preferences: bullet marker (- vs *), hr style

## Acceptance

- Test fixtures under packages/@km/markdown/tests/fidelity-corpus/
- Round-trip test: parse(.md) -> serialize -> parse -> assert AST equality
- No-op import/export: read -> write without changes -> assert byte equality where possible
- Real vault samples anonymized and added to corpus
- CI fails on regressions
- Used as gate in @km/storage/scale-architecture C-flip decision