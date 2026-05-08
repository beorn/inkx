---
aliases:
  - km-silvery.wrapper-friendly-render-primitive
  - km-silvery-wrapper-friendly-render-primitive
created_at: 2026-05-08T21:17:54.499Z
---

# Analyze wrapper-friendly Silvery render primitive for render invariants #task #P2

Problem: km-tui has domain-specific render invariants, such as exactly one visible [data-cursor], that need to run after committed AgNode/render frames. These checks do not belong in Silvery, but Silvery should expose an ergonomic method surface that consumers can wrap.

Initial hypotheses to analyze, not assume:

- Rename current public mount-style render() concept to mount() or otherwise distinguish mount/rerender from frame rendering.
- Expose a render(), renderOnce(), or renderFrame() method equivalent to the internal doRender/settled frame path so consumers can wrap one post-render boundary.
- Avoid callback/hook-style APIs for this project style unless analysis shows a method wrapper cannot cover keypress, mouse, resize, rerender, async auto-render, and initial mount.
- Keep km-specific invariants in apps/km-tui; Silvery should only expose the wrapper-friendly render surface.

Acceptance:

- Inventory existing Silvery App/createRenderer/render/rerender/doRender/onFrame surfaces and name which code paths produce frames.
- Recommend a minimal API shape with migration notes and naming rationale.
- Prove whether wrapping the proposed method covers press, click/wheel, resize, explicit rerender, initial mount, and autoRender.
- Include tests in vendor/silvery that demonstrate wrappers can observe every committed frame without command-specific wrapping.
- Update km-tui render invariant wiring to use the new wrapper surface if implemented.

Additional acceptance from current km-tui cursor work: after the wrapper-friendly render primitive/API is designed and implemented, refactor apps/km-tui/src/render-invariants.ts and the km-tui driver/test wiring to use that primitive directly. Remove any temporary per-press/per-mouse render-invariant calls that exist only because there is no wrapper-friendly render method yet. The final km-tui shape should be method-wrapper based, not command-specific or hook/callback based.

Also evaluate whether the existing onFrame callback should be removed, deprecated, or reduced to an internal implementation detail after a wrapper-friendly render method exists. The analysis should compare current onFrame users/semantics against the proposed method wrapper surface and include a migration path if removal/deprecation is recommended.

Broaden the API audit to review other on* callback hooks in the Silvery render/runtime surface for potential removal, deprecation, or conversion to wrapper-friendly methods. Do not assume all should go away; inventory actual users and classify each as keep, internalize, replace with method wrapping, or deprecate with migration notes.
