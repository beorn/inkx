---
id: "@km/_orphan/2g3tx"
aliases:
  - km-2g3tx
created_by: claude:f8196c1c
created_at: 2026-03-23T19:29:41Z
closed_at: 2026-03-23T22:21:21Z
close_reason: "Done: render() beginner API added to silvery barrel with TTY auto-detection"
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Add render() beginner API — zero-ceremony entry point @km/_orphan #feature #P1 @claude:fed8de9e

Add render(<App />) that handles term creation internally. run() stays for advanced use. This is the #1 DX improvement — reduces Hello World from 4 lines to 1.