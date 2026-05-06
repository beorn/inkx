---
mentions:
  - km
id: "@km/bearly/github-integration"
aliases:
  - km-bearly.github-integration
  - km-bearly-github-integration
created_by: claude:19080504
created_at: 2026-03-30T20:22:00Z
owner: bjorn@stabell.org
---

# [ ] GitHub integration: fix rate limiting, webhooks, smart polling @km/bearly #task #P2

GitHub MCP channel burning 21,600 API calls/hour vs 5,000 limit. Root cause: 40+ repos x N processes x 2 endpoints x 2/min. Fix: (1) ETag caching [done], (2) smart repo filtering, (3) conditional poll intervals, (4) move to daemon (single poller), (5) webhook receiver. See notes for reference architectures.

