---
mentions:
  - km
  - Bjørn
---

# [x] Phase 2: Migrate ALL remaining testEnv files to createTestApp @km/all #task #P0 @Bjørn Stabell

Migrate all remaining ~67 files using testEnv to createTestApp.
For store.getState() patterns: replace with app.state, app.card(), or the new white-box APIs.
For truly internal state that has no public equivalent: add a thin accessor on TestApp.

Delete: testEnv calls from every migrated file
/complete:

- grep -rn 'testEnv\b' apps/@km/tui/tests/ --include='*.ts' | grep -v helpers/ | wc -l → 0
- grep -rn 'testEnvWithRepo' apps/@km/tui/tests/ --include='*.ts' | grep -v helpers/ | wc -l → 0

