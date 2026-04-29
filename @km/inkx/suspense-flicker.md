---
id: "@km/inkx/suspense-flicker"
aliases:
  - km-inkx.suspense-flicker
  - km-inkx-suspense-flicker
created_at: 2026-02-05T14:36:47Z
closed_at: 2026-02-05T14:57:31Z
assignee: claude:ed93d0af
---

# [x] bug(inkx): Suspense transitions cause UI flicker — committed tree not preserved @km/inkx #bug #P2 @claude:ed93d0af

## Summary

When a React Suspense boundary suspends during a transition (e.g. triggered by useDeferredValue), inkx's terminal renderer produces frames where sibling/ancestor elements outside the Suspense boundary disappear momentarily. In React DOM, the committed tree stays visible until the new tree is ready — inkx should do the same.

## Reproduction (observed in km)

SearchDialog used useDeferredValue + Suspense to defer a synchronous SQLite query:

1. ModalDialog renders title="Search" (outside Suspense boundary)
2. User types → useDeferredValue triggers a transition
3. SearchResults component calls loader.read() which throws a promise (setTimeout(0) deferral)
4. Suspense catches it, should show fallback in results area only
5. **Bug**: The ModalDialog title disappears for ~1 frame, reappears when the promise resolves

The title is a sibling of the Suspense boundary, not inside it. React's contract: during a transition, the committed (old) UI stays visible until the new tree is fully ready. The title should never flicker.

## Workaround applied

SearchDialog was converted to synchronous rendering (dc931ad2) since the data was synchronous anyway. But this doesn't fix the underlying inkx renderer issue — real async Suspense use cases (data fetching, lazy loading) will hit the same bug.

## Investigation needed

1. **Trace the render cycle**: Add logging to inkx's reconciler/renderer to see what output is produced during a Suspense transition. Is the committed tree being discarded before the new tree is ready?
2. **Compare with react-reconciler docs**: Check how the host config's `prepareForCommit`, `resetAfterCommit`, `commitUpdate` etc. interact with Suspense transitions. The reconciler should only commit the new tree atomically.
3. **Check if inkx double-buffers**: If inkx writes output line-by-line during reconciliation (instead of buffering the full frame and swapping atomically), intermediate states would be visible as flicker.
4. **Minimal repro**: Create a test case with a simple Suspense boundary + useDeferredValue that verifies sibling content stays visible during suspension.

## Expected outcome

- Tests proving Suspense transitions don't cause sibling/ancestor flicker
- Root cause identified and fixed in the inkx renderer
- If this is a fundamental react-reconciler limitation for terminal renderers, document it and provide guidance on safe Suspense patterns