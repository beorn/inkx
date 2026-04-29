---
id: "@km/silvery/theme-stack-leak"
aliases:
  - km-silvery.theme-stack-leak
  - km-silvery-theme-stack-leak
created_by: claude:c9beade3
created_at: 2026-03-13T04:28:41Z
closed_at: 2026-03-13T04:51:08Z
close_reason: "Fixed in 895190a. theme-stack-leak: try/finally around
  pushContextTheme/popContextTheme in content-phase.ts. hidden-dirty-flags:
  clearDirtyFlags() called on early return for hidden and display:none nodes."
---

# [x] Theme stack push/pop not exception-safe — leaks on render throw @km/silvery #bug #P1

In renderNodeToBuffer(), if any child render throws between pushContextTheme() and popContextTheme(), the module-global theme stack leaks, corrupting all subsequent renders. Fix: try/finally wrapper. Found by GPT pipeline review (2/3 flagged as high).