---
id: "@km/infra/doc-edit-safety"
aliases:
  - km-infra.doc-edit-safety
  - km-infra-doc-edit-safety
created_by: Bjørn Stabell
created_at: 2026-04-15T01:48:50Z
---

# [ ] Encode doc-edit safety rule: never use perl/sed for markdown with pipe-heavy content @km/infra #task #P2

blocks:: [[@km/infra]]

## Problem

Session ec515817-a0ff-49ae-ab55-52d692b3d84b catastrophically corrupted docs/design/omnibox.md via a `perl -i -pe 's|...|...|g'` substitution where the pattern contained unescaped pipe characters. Perl's `s|A|B|` syntax treats every `|` as a delimiter; with literal `|` embedded (e.g. TypeScript union types like `OmniboxState | null` or markdown table rows), the parse silently failed and the output was character-by-character garbage with `| null` interleaved between every byte.

The corrupted file then tripped Anthropic's content classifier on the next `Read` call — the `| null`` repetition pattern looks like a prompt-injection shape — and the session bounced with three "API Error: appears to violate our Usage Policy" refusals before being abandoned. No actual AUP violation; a tooling failure manifested as a false-positive safety trip.

## Root cause

Two failure modes compounded:

1. **Tool mismatch**: `perl -i` / `sed -i` regex substitutions on multi-line markdown with pipe-heavy content (TS type annotations, markdown tables, `|`-separated enums) are fundamentally unsafe — the delimiter choice of `s|...|...|` collides with content.
2. **No encoded rule**: MEMORY.md had an editsets preference but nothing in CLAUDE.md, skills, or any pre-tool hook prevented an agent from reaching for perl under pressure. The feedback rule "encode rules in steering docs, don't rely on memories" was itself violated here.

## Fix scope

Encode the rule in steering docs and/or skills where agents will actually see it:

- **CLAUDE.md** (km root): add a line in 'Boundaries' → **Never** section or 'Gotchas' forbidding perl/sed/awk `-i` on markdown files, especially any with pipe characters, TS unions, or tables. Pointer to Edit tool / editsets.
- **.claude/skills/docs/** (if it exists): same rule as primary content, with concrete alternatives (Edit for surgical changes, editsets for multi-file, per-file Read+Edit as fallback).
- **.claude/skills/refactor/** or **.claude/skills/batch-refactor/**: call out markdown pipe-content as a known-unsafe input; suggest `bun vendor/bearly/tools/refactor.ts` (which uses editsets) instead.
- **Consider a pre-tool hook** that blocks `perl -i`/`sed -i` against `*.md` files and prints the alternative. Low false-positive risk — regex edits on markdown are almost always a bad idea.

## Acceptance

(a) CLAUDE.md (km root) has an explicit rule: "Never use `perl -i`, `sed -i`, or any regex substitution on markdown files; use Edit tool or editsets."
(b) At least one skill doc reachable from the refactor/doc workflows repeats the rule with the reason (pipe collision + classifier false-positive precedent).
(c) Optional: dcg hook or similar rule added to block `perl -i` / `sed -i` targeting `*.md` files at the shell layer.
(d) Feedback memory entry added/updated pointing to the encoded rule (evergreen the steering, deprecate the loose memory).

## References

- Prior session: ec515817-a0ff-49ae-ab55-52d692b3d84b (Apr 14 2026)
- Corruption pattern: `| null` interleaved between every character of docs/design/omnibox.md
- Recovery: git show HEAD > file + 13-line Edit repairs
- Related feedback memory: feedback_batch-refactor-default.md, feedback_batch-refactor-for-migrations.md