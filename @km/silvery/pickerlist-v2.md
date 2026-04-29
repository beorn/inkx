---
id: "@km/silvery/pickerlist-v2"
aliases:
  - km-silvery.pickerlist-v2
  - km-silvery-pickerlist-v2
created_by: Bjørn Stabell
created_at: 2026-04-02T21:59:39Z
closed_at: 2026-04-03T01:08:54Z
close_reason: Implemented. PickerList delegates to ListView,
  keyExtractor→getKey. Commit 25442c8.
owner: bjorn@stabell.org
---

# [x] PickerList as ListView composition @km/silvery #task #P2

Rewrite PickerList as ListView + fuzzy filter + onSelect. CommandPalette builds on this.