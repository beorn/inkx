---
id: "@km/tui/real-vault-smoke-test"
aliases:
  - km-tui.real-vault-smoke-test
  - km-tui-real-vault-smoke-test
created_by: Bjørn Stabell
created_at: 2026-04-15T16:54:50Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.real-vault-smoke-test
    depends_on_id: km-review.silvery-gap-analysis
    type: blocks
    created_at: 2026-04-15T11:31:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
  - issue_id: km-tui.real-vault-smoke-test
    depends_on_id: km-silvery.selection-focus-plateau
    type: parent-child
    created_at: 2026-04-15T11:31:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Real-vault smoke test to catch dogfood bugs that unit tests miss @km/tui #task #P3

blocks:: [[@km/review/silvery-gap-analysis]], [[@km/silvery/selection-focus-plateau]]

Every few dogfood turns surfaces a new bug that passes all unit tests (RESOLVER.md §§, goto leaf, cursor drift, startup freeze). Signal: TTY-level coverage is weak. Add a real-vault smoke test runner: open a known vault, exercise all keybindings, assert no bells, no cursor loss, no freeze, no render errors. Run on every /complete and before every release. Scope: new .spec.ts file in apps/@km/tui/tests/, probably using termless + a fixture vault under apps/@km/tui/tests/fixtures/real-vault/.