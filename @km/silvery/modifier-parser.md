---
id: "@km/silvery/modifier-parser"
aliases:
  - km-silvery.modifier-parser
  - km-silvery-modifier-parser
created_by: Bjørn Stabell
created_at: 2026-04-10T23:04:50Z
closed_at: 2026-04-10T23:14:58Z
close_reason: parseKey now sets key.isModifierOnly; isModifierOnlyEvent() checks
  flag instead of heuristic
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Move isModifierOnly detection to parser (key.isModifierOnly flag) @km/silvery #task #P1 @Bjørn Stabell

GPT 5.4 Pro finding: isModifierOnlyEvent() re-derives modifier-only from empty input + no action flags. This is parser work done too late and will get brittle as more keys are added (media keys, PUA keys, etc).

Fix: parseKey() should set key.isModifierOnly = true when it detects a modifier-only sequence from Kitty protocol. Then isModifierOnlyEvent() just checks the flag.

/complete: parseKey sets key.isModifierOnly; isModifierOnlyEvent checks flag not heuristic