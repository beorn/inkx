---
id: "@km/tui/vault-body-empty"
aliases:
  - km-tui.vault-body-empty
  - km-tui-vault-body-empty
created_by: Bjørn Stabell
created_at: 2026-04-14T20:30:12Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.vault-body-empty
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T13:30:12Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Vault folder card shows no body content despite content lines set to max @km/tui #bug #P3

blocks:: [[@km/tui]]

Screenshot 2026-04-14 13.16.34: the 'Inbox' card shows its inline body content ('Auto-populated via km.add rules above — files in ./inbox/...') but the 'Vault ...' sibling card shows only the title with no body, despite user reporting 'content lines set to max'.

Investigation hypotheses:
  1. Vault/ is a folder without an index file, so the card's 'body' is just its column of children — there IS no inline body text at the folder level.
  2. Vault has an index file (Vault.md or README.md) but the body paragraphs aren't merging into the card via computeColumnChildren folder-note expansion.
  3. Folder cards render differently from file cards and bypass the body-text extraction path.
  4. maxContentLines isn't honored for body-less folder cards because extractBody returns empty.

Repro:
  km view ~/Bear/Vault
  cursor to the Vault card (root folder card)
  observe: title visible, no body text
  verify: does ~/Bear/Vault/Vault.md or similar index file exist? does it have body paragraphs?

If (1) — user-facing doc: 'folder cards show only children unless a matching index file exists'. Possibly link to @km/tui/folder-note-model.
If (2-4) — real bug in the extractBody / column-children pipeline for folder cards.