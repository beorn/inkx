---
mentions:
  - km
  - Bjørn
id: "@km/silvery/tea-gap-view-factory"
aliases:
  - km-silvery.tea-gap-view-factory
  - km-silvery-tea-gap-view-factory
created_by: Bjørn Stabell
created_at: 2026-04-18T19:01:00Z
closed_at: 2026-04-19T05:21:39Z
close_reason: "Landed as 9721b572 on silvery main. withReact now accepts
  object-form { view: ReactElement | (app) => ReactElement } alongside legacy
  positional form. 9 new tests in packages/create/tests/with-react.test.ts, all
  108 create tests pass. Factory eagerly resolves at plugin-install so it sees
  all upstream plugins' additions."
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.tea-gap-view-factory
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-18T12:01:16Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [x] TEA gap: withReact view should accept factory (app) => ReactElement @km/silvery #task #P2 @Bjørn Stabell

blocks:: [[@km/silvery/tea]]

Discovered while executing the aichat-v2 spike (@km/silvery/tea-aichat).

## Problem

`withReact({ view: ReactElement })` takes the view eagerly at plugin-install
time. But in realistic app composition, the view often needs to reference
app state that's installed by earlier plugins (e.g. `app.chat` from
`withChat`). Today this forces an awkward up-front declaration:

const chat = createChatModel({ ..., onExit: () => quit() })
  let quit = () => {}   // late-bound because app.quit doesn't exist yet
  using app = pipe(
    create(), withScope, withCommands, withChat({ chat }),
    withReact({ view: <ChatProvider chat={chat}><ChatView /></ChatProvider> }),
  )
  quit = () => app.quit()  // rebind after composition

## Proposed API

Allow `view` to be either a `ReactElement` (current) or a lazy factory:

withReact({ view: (app) => <ChatProvider chat={app.chat}><ChatView /></ChatProvider> })

The factory runs after all plugins have installed, so `app.chat` /
`app.quit()` are live. This removes the late-bound quit hack and keeps the
"single source of truth" for the domain model inside `withChat`.

## Where

Substrate file: vendor/silvery/packages/create/src/with-react.ts
(on main) or the equivalent on feat/tea-apply-chain-types

## Seen in

hub/silvery/prototype/aichat-v2/app.tsx main() function

## Effort

Small (~20 lines in with-react.ts): detect function type, call with `app`.

