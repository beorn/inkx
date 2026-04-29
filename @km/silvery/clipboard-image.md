---
id: "@km/silvery/clipboard-image"
aliases:
  - km-silvery.clipboard-image
  - km-silvery-clipboard-image
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:37Z
---

# [ ] Clipboard: image paste support via OSC 52 + terminal clipboard APIs @km/silvery #feature #P4

blocks:: [[@km/silvery/opentui-parity]]

Extend usePaste to handle images (PNG/JPEG) pasted from system clipboard. Encode via Kitty graphics or detect and reject gracefully.