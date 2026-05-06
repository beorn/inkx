---
mentions:
  - km
  - claude
id: "@km/silvery/plateau-naming-polish"
aliases:
  - km-silvery.plateau-naming-polish
  - km-silvery-plateau-naming-polish
created_by: claude:c6244087
created_at: 2026-04-23T18:45:45Z
closed_at: 2026-04-23T19:10:57Z
close_reason: Closed
owner: bjorn@stabell.org
assignee: claude:c6244087
dependencies:
  - issue_id: km-silvery.plateau-naming-polish
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-23T11:46:05Z
    created_by: claude:c6244087
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Rename identity→emulator, drop heuristics namespace, TERM/maybe* naming @km/silvery #task #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Post-plateau naming polish:

## Renames

- `TerminalIdentity` type → `TerminalEmulator`
- `profile.identity` → `profile.emulator`
- `term.identity` → `term.emulator`
- `identity.termName` → `emulator.TERM` (uppercase: matches env var convention)
- `identity.program` → `emulator.program` (same name, new parent)
- `identity.version` → `emulator.version` (same)

## Heuristics namespace → absorbed into caps

- Delete `TerminalHeuristics` type
- Delete `profile.heuristics` / `term.heuristics`
- `heuristics.darkBackground` → `caps.maybeDarkBackground`
- `heuristics.nerdfont` → `caps.maybeNerdFont`
- `heuristics.textEmojiWide` → `caps.maybeWideEmojis`

## Why

- `identity` too generic; `emulator` matches `TERM_PROGRAM` provenance
- `maybe*` prefix = inline uncertainty signal at every call site (louder than namespace)
- 3 heuristic fields don't earn a namespace; no one iterates them as a group
- `TERM` self-documents (shell convention)

## Acceptance

- grep '\.identity\.' in silvery+km → only inside `TerminalEmulator` docstrings or migration notes
- grep '\.heuristics\.' in silvery+km → 0 hits outside migration comments
- grep 'termName' → 0 hits
- All tests pass, lint clean

