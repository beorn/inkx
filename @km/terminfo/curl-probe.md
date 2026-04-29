---
id: "@km/terminfo/curl-probe"
aliases:
  - km-terminfo.curl-probe
  - km-terminfo-curl-probe
created_by: claude:4929065a
created_at: 2026-03-31T21:31:43Z
closed_at: 2026-03-31T21:47:43Z
close_reason: Built pure POSIX shell script at docs/public/probe — 34 feature
  checks, DA1 sentinel pattern, alt screen isolation, cleanup traps. Live at
  terminfo.dev/probe.
---

# [x] curl-based terminal probe — curl terminfo.dev/probe | sh @km/terminfo #feature #P3 @claude:4929065a

A pure shell script that probes terminal features without requiring Node.js. Downloads from terminfo.dev/probe, runs escape sequence probes via bash/zsh, outputs JSON, and optionally submits via GitHub API. Cross-platform (macOS, Linux, WSL). The npx version is the full experience; curl is the zero-dependency alternative.