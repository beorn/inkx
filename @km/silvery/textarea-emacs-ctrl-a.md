---
mentions:
  - km
  - claude
projects:
  - A
id: "@km/silvery/textarea-emacs-ctrl-a"
aliases:
  - km-silvery.textarea-emacs-ctrl-a
  - km-silvery-textarea-emacs-ctrl-a
created_by: claude:acc2e8e3
created_at: 2026-04-26T06:10:02Z
started_at: 2026-04-26T06:10:41Z
owner: bjorn@stabell.org
assignee: claude:acc2e8e3
---

# [/] TextArea: Ctrl+A → beginning of line (emacs/readline), not select-all @km/silvery #feature #P2 @claude:acc2e8e3

useTextArea binds Ctrl+A to select-all (browser convention). User expects emacs/readline convention: Ctrl+A=beginning-of-line, Ctrl+E=end-of-line. TextInput already does this via useReadline.ts:178. Align TextArea.

