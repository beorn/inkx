---
mentions:
  - km
  - claude
id: "@km/silvery/phase-a1-signals-name-uniqueness"
aliases:
  - km-silvery.phase-a1-signals-name-uniqueness
  - km-silvery-phase-a1-signals-name-uniqueness
created_by: claude:019d032d
created_at: 2026-04-23T00:44:05Z
closed_at: 2026-04-23T00:46:11Z
close_reason: Shipped silvery 7dac8778. Duplicate-name registrations throw; 20
  term-signals tests pass.
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-silvery.phase-a1-signals-name-uniqueness
    depends_on_id: km-silvery.pro-review-p1
    type: parent-child
    created_at: 2026-04-22T17:44:24Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.pro-review-p1
---

# [x] Phase A1: term.signals.on() rejects duplicate names @km/silvery #task #P2 @claude:019d032d

blocks:: [[@km/silvery/pro-review-p1]]

## What changes

- `packages/ag-term/src/runtime/devices/signals.ts` — `on()` throws if `options.name` is already registered. Auto-generated IDs (when name is omitted) remain unique by id generation.
- Tests: existing tests use unique names; add one new test that verifies dup-name rejection.

## Delete

- None (behavioral change: silent tiebreak → explicit throw).

## /complete grep criteria

- `grep -rn "options.name" vendor/silvery/packages/ag-term/src/runtime/devices/signals.ts` shows the name-uniqueness check at `on()` entry
- New test `signals.on() throws on duplicate name` in `tests/runtime/signals*.test.ts` — passes

## Mandatory

Read docs/lessons/refactoring.md IN FULL before writing any code.

