---
id: "@km/silvery/clipboard-paste-cleanup"
aliases:
  - km-silvery.clipboard-paste-cleanup
  - km-silvery-clipboard-paste-cleanup
created_by: Bjørn Stabell
created_at: 2026-04-06T07:27:42Z
owner: bjorn@stabell.org
---

# [ ] Paste architecture + clipboard abstraction review @km/silvery #task #P3

Follow-up from @km/silvery/interactions-runtime. Review paste architecture, internal clipboard, and clipboard abstraction. Deferred from interactions-runtime to keep scope focused on selection/find/copy-mode/drag features. Scope: evaluate whether internal clipboard (in-process copy buffer), paste-from-external (OSC 52 read or stdin), and SemanticCopyProvider belong as separate features or unified clipboard feature.