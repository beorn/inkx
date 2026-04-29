---
id: "@km/vault-loader/4-update-other-commands-to-use-loadvault"
aliases:
  - km-vault-loader.4
  - km-vault-loader-4
  - "@km/vault-loader/4"
created_at: 2026-01-23T09:40:11Z
closed_at: 2026-01-23T10:55:37Z
---

# [x] Update other commands to use loadVault() @km/vault-loader #task #P2

Update all CLI commands to use loadVault():

- km sh, km show, km add, km move, km new: run(loadVault(root))
- km rebuild: withProgress(loadVault(root, { force }))
- km sync: withProgress(loadVault(root))