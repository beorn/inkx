---
mentions:
  - km
  - claude
id: "@km/inbox/otm6c"
aliases:
  - km-otm6c
  - "@km/_orphan/otm6c"
created_by: claude:cc081a9a
created_at: 2026-04-26T21:13:02Z
closed_at: 2026-04-26T22:43:14Z
close_reason: Closed
started_at: 2026-04-26T22:12:20Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-otm6c
    depends_on_id: km-all.fix-sweep-strict-cluster
    type: parent-child
    created_at: 2026-04-26T14:13:06Z
    created_by: claude:cc081a9a
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all.fix-sweep-strict-cluster
---

# [x] TUI: td chord Escape doesn't close datePrompt dialog @km/_orphan #bug #P2 @claude:cc081a9a

blocks:: [[@km/all/fix-sweep-strict-cluster]]

After opening date dialog via 'td' chord and typing characters, pressing Escape does NOT close the dialog. ui.datePrompt remains set with the original currentValue. Symptom: production-entry.slow.spec.ts:732 'td chord opens date dialog, Escape cancels and closes it' fails consistently. The Enter-to-confirm path works (line 700 test passes); only Escape fails. Likely the Escape key isn't reaching dialog.cancel — possibly due to text input layer absorbing it before keybinding resolution, or DIALOG_CANCEL fires but neither dialogTargetRef nor activeEditTargetRef is set so the fallback path is reached. Original bead @km/_orphan/qaco9 was closed prematurely. Reproduction: bun vitest run --project=slow apps/@km/tui/tests/production-entry.slow.spec.ts -t 'td chord opens date dialog, Escape'. Test currently skipped via .skip with reference to this bead.

