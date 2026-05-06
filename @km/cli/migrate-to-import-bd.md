---
aliases:
  - km-cli.migrate-to-import-bd
  - km-cli-migrate-to-import-bd
created_at: 2026-05-06T17:12:16.989Z
---

# Move bd migrate/export → km import bd / km import bd-export. bd-migrate.ts (505 LOC) is self-contained — imports from @km/beads, @km/storage, and loadKmBdConfig only; zero references to other bd-* action handlers. Register as subcommand of importCommand alongside km import asana. Delete bd-migrate.ts + drop migrateCommand/exportCommand from bd.ts. #P3
