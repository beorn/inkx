---
mentions:
  - km
  - claude
id: "@km/terminfo/cc-by-4"
aliases:
  - km-terminfo.cc-by-4
  - km-terminfo-cc-by-4
created_by: claude:4929065a
created_at: 2026-04-01T19:03:30Z
closed_at: 2026-04-01T19:14:45Z
close_reason: CC BY 4.0 LICENSE added, repo made public, issues enabled, submit page created.
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Add CC BY 4.0 license + make repo public @km/terminfo #task #P2 @claude:4929065a

Add CC BY 4.0 license to terminfo.dev and make the repo public. Follows the caniuse.com model — data is open, community contributes, credibility comes from being THE terminal capability reference.

## Steps

1. Add LICENSE file (CC BY 4.0 full text)
2. Add license badge to README
3. Add license notice to site footer
4. Review repo for anything that shouldn't be public:
  - No secrets in code (API tokens are in GitHub secrets, not committed)
  - No proprietary algorithms (it's data + VitePress site)
  - Cloudflare account ID is in deploy.yml (this is fine — it's not a secret)
5. Make repo public: `gh repo edit beorn/terminfo.dev --visibility public`
6. Enable GitHub Issues (for community contributions)
7. Update test script + submit page to use the now-public issue tracker
8. Add CONTRIBUTING.md with data contribution guide

## Why

- caniuse.com, caniemail.com, node.green all use this model
- CC BY 4.0 = anyone can use the data with attribution
- Public repo enables community issue-based probe submissions
- Builds credibility and ecosystem adoption

## Blocked on

Nothing — ready to execute.

