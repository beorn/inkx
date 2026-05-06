---
aliases:
  - km-silvercode.notification-vocabulary-migration
  - km-silvercode-notification-vocabulary-migration
created_at: 2026-05-06T23:07:40.920Z
type: task
priority: P1
status: open
---

# [ ] Complete Silvercode notification vocabulary migration @km/silvercode #task #P1

Standardize the remaining Silvercode planning and operational vocabulary around notifications.

Current state:

- `apps/silvercode/src`, `apps/silvercode/tests`, `apps/silvercode/storybook`, and `apps/silvercode/docs` use notification terminology for the current implementation.
- `apps/silvercode/src/chat/types.ts` has first-class `notification.received`, `ChatLeafType = "notification"`, and `channel = "notification"`.
- Current planning docs use `ChatPane` for the pane and `ChatBlock` for rendered transcript/UI blocks.
- Several older bead ids and historical close reasons still contain old terms. Renaming those safely requires a focused bead-id/reference migration, not opportunistic edits during feature work.

Scope:

- Rename active Silvercode planning beads and references from old background-context wording to notification wording.
- Decide whether to rename legacy bead ids/files or keep them as historical aliases with an explicit boundary note.
- Update any open or wip beads that mention old UI names such as `SessionCard`, `WelcomeCard`, or "header strip" when they describe current architecture.
- Leave literal protocol bytes alone if the provider/API still uses them; document those as provider-wire terms, not Silvercode UI vocabulary.

Acceptance:

- `rg -n "\\b(Ambient|ambient)\\b|SessionCard|WelcomeCard|card stream|card boundary|header strip|single-row strip|tab strip" @km/silvercode apps/silvercode/docs apps/silvercode/src apps/silvercode/tests apps/silvercode/storybook -g '!ambient-*' -g '!claude-code-transcript-parity/**'` returns only documented historical/provider-wire exceptions.
- Any exceptions are listed in this bead with owner, reason, and whether to migrate or keep.
- No new source/docs/tests use old Silvercode UI vocabulary.
