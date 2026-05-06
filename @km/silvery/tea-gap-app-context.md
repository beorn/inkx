---
mentions:
  - km
  - Bjørn
id: "@km/silvery/tea-gap-app-context"
aliases:
  - km-silvery.tea-gap-app-context
  - km-silvery-tea-gap-app-context
created_by: Bjørn Stabell
created_at: 2026-04-18T19:01:21Z
closed_at: 2026-04-19T05:24:48Z
close_reason: Landed as d5a1a548 on silvery main. New helper
  createAppContext<T>(options?) in @silvery/create returning { AppContext,
  AppProvider, useApp }. 9 tests exercise provider round-trip, out-of-provider
  throws with configurable error message, default/custom name displayName,
  nested providers, independent contexts, TS generic inference. All 117 create
  tests pass (108 + 9 new).
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-silvery.tea-gap-app-context
    depends_on_id: km-silvery.tea
    type: parent-child
    created_at: 2026-04-18T12:01:38Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery.tea
---

# [x] TEA gap: createAppContext<T>() helper for domain-plugin React bridge @km/silvery #task #P3 @Bjørn Stabell

blocks:: [[@km/silvery/tea]]

Discovered while executing the aichat-v2 spike (@km/silvery/tea-aichat).

## Problem

Every domain plugin that needs React read access to its model has to
hand-roll a context pattern:

const ChatContext = createContext<ChatModel | null>(null)
  function useChat<U>(selector: (m: ChatModel) => U): U {
    const chat = useContext(ChatContext)
    if (!chat) throw new Error("useChat outside <ChatProvider>")
    return useModel(chat, selector)
  }
  function ChatProvider({ chat, children }) { ... }

This is 15-20 lines of boilerplate per domain (withChat, withBoard,
withSelection, withFind, ...). Error messages drift. Null-check
strictness drifts.

## Proposed API

A helper in @silvery/create that wraps the pattern:

const chatCtx = createAppContext<ChatModel>("chat")
  // → { Provider, use, useSelector }
  <chatCtx.Provider value={chat}>
    <View />
  </chatCtx.Provider>
  // Inside a component:
  const chat = chatCtx.use()                 // whole model
  const messages = chatCtx.useSelector(m => m.messages())  // via useModel()

The string name ("chat") feeds into clearer "outside <X.Provider>"
errors and could tie in with displayName for React devtools.

## Where

New file: vendor/silvery/packages/create/src/app-context.ts (or similar)
Exported from: @silvery/create

## Seen in

hub/silvery/prototype/aichat-v2/app.tsx — manually-rolled ChatContext.

## Effort

Small (~30 lines) if built on top of `useModel()`.

