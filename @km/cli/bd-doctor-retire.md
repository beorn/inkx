---
aliases:
  - km-cli.bd-doctor-retire
  - km-cli-bd-doctor-retire
created_at: 2026-05-06T17:12:18.925Z
---

# Retire km bd doctor (138 LOC). It's a one-time vault-layout migration tool (single subcommand: migrate-to-beads-root). Move it under km doctor migrate-to-beads-root, drop attachDoctorCommands from bd.ts. Keep the escape hatch one tier deeper instead of deleting. #P3
