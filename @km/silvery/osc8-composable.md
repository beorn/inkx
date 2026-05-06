---
mentions:
  - km
id: "@km/silvery/osc8-composable"
aliases:
  - km-silvery.osc8-composable
  - km-silvery-osc8-composable
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:21Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.osc8-composable
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:21Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.opentui-parity
---

# [ ] Protocol: OSC 8 hyperlinks composable in any component @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Silvery has <Link>, but OSC 8 should be composable — auto-detect URL in text, allow href prop on Text/Box, show hover underline, trigger on click.

