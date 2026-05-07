---
mentions:
  - km
  - claude
id: "@km/silvery/term-interface-diet"
aliases:
  - km-silvery.term-interface-diet
  - km-silvery-term-interface-diet
created_by: claude:019d032d
created_at: 2026-04-23T01:26:17Z
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-silvery.term-interface-diet
    depends_on_id: km-silvery.input-structured-events
    type: blocks
    created_at: 2026-04-22T18:26:32Z
    created_by: claude:019d032d
    metadata: "{}"
  - issue_id: km-silvery.term-interface-diet
    depends_on_id: km-silvery.term-sub-owners
    type: parent-child
    created_at: 2026-04-22T18:26:32Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvery.input-structured-events
      - type: link
        target: km-silvery.term-sub-owners
---

# [ ] Delete redundant legacy slots on Term (write/writeLine/cols/rows/hasInput/hasCursor/hasColor/hasUnicode/caps) @km/silvery #task #P3 @claude:019d032d

blocks:: [[@km/silvery/input-structured-events]], [[@km/silvery/term-sub-owners]]

## Why

After the sub-owner refactor the public Term interface still carries convenience duplicates of sub-owner APIs:

| Legacy             | Replacement                                                                     |
| ------------------ | ------------------------------------------------------------------------------- |
| term.write(s)      | term.output.write(s) (or term.modes mutations)                                  |
| term.writeLine(s)  | term.output.write(s + "\n")                                                     |
| term.cols (number) | term.size.cols()                                                                |
| term.rows (number) | term.size.rows()                                                                |
| term.hasInput()    | term.input !== undefined                                                        |
| term.hasCursor()   | capability check — move to term.caps or keep as static property                 |
| term.hasColor()    | capability check — same                                                         |
| term.hasUnicode()  | capability check — same                                                         |
| term.caps          | TerminalCaps object — rationalize with the has*() methods                       |
| term.getState()    | term.size.snapshot() (covered by input-structured-events)                       |
| term.subscribe()   | watch(() => term.size.snapshot(), handler) (covered by input-structured-events) |

Each is a 5–15 min deletion once consumers are migrated. Can be done as one "Term interface diet" pass or folded into `km-silvery.input-structured-events`.

## Scope (after input-structured-events lands)

1. Grep for each legacy name — see who still calls it.
2. Migrate each call site to the sub-owner equivalent.
3. Delete the property from termBase in all three factories (createNodeTerm / createHeadlessTerm / createBackendTerm).
4. Drop from the `Term` interface type.

## Capability surface decision

`hasCursor/hasColor/hasInput/hasUnicode` + `caps` are currently flat siblings to the sub-owners. Two viable shapes:

- **Option A — collapse into `term.caps`**: rename the static TerminalCaps object so `term.caps.color`, `term.caps.cursor`, etc. Remove the has*() functions. One property with readable fields.
- **Option B — sub-owner `term.capabilities`**: overkill for a static snapshot.

Recommend Option A.

## Acceptance

- [ ] `grep -rn "term\.write\b\|term\.writeLine\b\|term\.cols\b\|term\.rows\b\|term\.hasInput\|term\.hasCursor\|term\.hasColor\|term\.hasUnicode" apps packages vendor/silvery --include='*.ts' --include='*.tsx' | grep -v '/dist/\|node_modules\|\.test\.'` returns 0
- [ ] `term.caps.{color,cursor,input,unicode,...}` is the single capability surface
- [ ] All tests pass; tsc 0 non-vendor errors
- [ ] No compat shims / @deprecated

## Depends on

@km/silvery/input-structured-events (which retires events/getState/subscribe — the heaviest legacy slots).

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

