---
id: "@km/flexily/dns"
aliases:
  - km-flexily.dns
  - km-flexily-dns
created_by: claude:491faf6c
created_at: 2026-03-25T20:03:59Z
closed_at: 2026-03-25T20:18:50Z
close_reason: Cloudflare zone created with 4 A records + www CNAME. Pending
  Porkbun NS change to dawn/max.ns.cloudflare.com
---

# [x] flexily.dev DNS broken — points to AWS instead of GitHub Pages @km/flexily #bug #P1

flexily.dev A records point to AWS EC2 IPs (44.227.65.245, 44.227.76.166) instead of GitHub Pages IPs (185.199.108-111.153). SSL handshake fails — site is completely unreachable at https://flexily.dev.

The site works at beorn.codes/flexily (GitHub Pages). Fix: update flexily.dev DNS A records to GitHub Pages IPs, or set up a CNAME to beorn.github.io.

Found by /test-site deep scan 2026-03-25.